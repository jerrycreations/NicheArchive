import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "./__fixtures__/videos-list.json";
import { fetchVideoMetadata } from "./metadata";

const ID = "dQw4w9WgXcQ";
const KEY = "test-youtube-key";

const fetchMock = vi.fn<typeof fetch>();

/** Every call gets a fresh response, since a body can only be read once. */
function reply(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => Response.json(body, { status }));
}

function withItem(changes: { duration?: string; publishedAt?: string }) {
  const [item] = fixtures.video.items;
  return {
    items: [
      {
        ...item,
        snippet: { ...item.snippet, publishedAt: changes.publishedAt ?? item.snippet.publishedAt },
        contentDetails: { duration: changes.duration ?? item.contentDetails.duration },
      },
    ],
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("YOUTUBE_API_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchVideoMetadata", () => {
  it("returns what the app stores about the video", async () => {
    reply(fixtures.video);
    expect(await fetchVideoMetadata(ID)).toEqual({
      ok: true,
      video: {
        youtubeId: ID,
        title: "How Bread Rises",
        channel: "The Kitchen Lab",
        durationSeconds: 247,
        publishedAt: new Date("2025-03-14T15:00:07Z"),
        privacyStatus: "public",
        liveBroadcastContent: "none",
      },
    });
  });

  it("asks for only the parts and fields it stores, with the key in a header", async () => {
    reply(fixtures.video);
    await fetchVideoMetadata(ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("snippet,contentDetails,status");
    expect(url.searchParams.get("id")).toBe(ID);
    expect(url.searchParams.get("fields")).toBe(
      "items(snippet(title,channelTitle,publishedAt,liveBroadcastContent),contentDetails(duration),status(privacyStatus))",
    );
    expect(url.searchParams.has("key")).toBe(false);
    expect(url.href).not.toContain(KEY);
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(KEY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["an empty list", fixtures.empty],
    ["no items key", {}],
  ])("reports %s as not_found (private or deleted)", async (_, body) => {
    reply(body);
    expect(await fetchVideoMetadata(ID)).toMatchObject({ ok: false, error: "not_found" });
  });

  it.each([
    ["live", fixtures.live],
    ["upcoming", fixtures.upcoming],
  ])("refuses a %s stream", async (_, body) => {
    reply(body);
    expect(await fetchVideoMetadata(ID)).toMatchObject({
      ok: false,
      error: "live_or_upcoming",
    });
  });

  it("reports a used-up quota", async () => {
    reply(fixtures.quotaExceeded, 403);
    expect(await fetchVideoMetadata(ID)).toMatchObject({
      ok: false,
      error: "quota_exceeded",
      detail: expect.stringContaining("HTTP 403 quotaExceeded: The request cannot"),
    });
  });

  it("reports the old daily limit reason as a used-up quota", async () => {
    reply({ error: { code: 403, errors: [{ reason: "dailyLimitExceeded" }] } }, 403);
    expect(await fetchVideoMetadata(ID)).toMatchObject({ ok: false, error: "quota_exceeded" });
  });

  it.each([
    ["an invalid key (current format)", fixtures.keyInvalid, 400],
    ["an invalid key (old format)", fixtures.keyInvalidLegacy, 400],
    ["a key restricted to other APIs", fixtures.serviceBlocked, 403],
    ["the API not enabled", fixtures.serviceDisabled, 403],
  ])("reports %s as bad_key", async (_, body, status) => {
    reply(body, status);
    expect(await fetchVideoMetadata(ID)).toMatchObject({ ok: false, error: "bad_key" });
  });

  it("reports a blank key as bad_key without calling YouTube", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(await fetchVideoMetadata(ID)).toMatchObject({
      ok: false,
      error: "bad_key",
      detail: expect.stringContaining("YOUTUBE_API_KEY is missing"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed request as network", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchVideoMetadata(ID)).toEqual({
      ok: false,
      error: "network",
      detail: "fetch failed",
    });
  });

  it("reports a timeout as network", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    expect(await fetchVideoMetadata(ID)).toEqual({
      ok: false,
      error: "network",
      detail: "YouTube didn't respond within 10 seconds.",
    });
  });

  it("reports a server error as unexpected", async () => {
    reply({ error: { code: 500, message: "Backend Error", errors: [{ reason: "backendError" }] } }, 500);
    expect(await fetchVideoMetadata(ID)).toEqual({
      ok: false,
      error: "unexpected",
      detail: "HTTP 500 backendError: Backend Error",
    });
  });

  it("reports an error page that isn't JSON as unexpected", async () => {
    fetchMock.mockImplementation(
      async () => new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    expect(await fetchVideoMetadata(ID)).toEqual({
      ok: false,
      error: "unexpected",
      detail: "HTTP 502",
    });
  });

  it("doesn't mistake a 400 with no key reason for a bad key", async () => {
    reply({ error: { code: 400, errors: [{ reason: "badRequest" }] } }, 400);
    expect(await fetchVideoMetadata(ID)).toMatchObject({ ok: false, error: "unexpected" });
  });

  it.each([
    ["a malformed duration", withItem({ duration: "4 minutes" })],
    ["a malformed publish date", withItem({ publishedAt: "last Tuesday" })],
    ["an item missing its fields", { items: [{ snippet: { title: "No details" } }] }],
    ["a body that isn't an object", ["not", "an", "object"]],
  ])("reports %s as unexpected", async (_, body) => {
    reply(body);
    expect(await fetchVideoMetadata(ID)).toMatchObject({ ok: false, error: "unexpected" });
  });
});

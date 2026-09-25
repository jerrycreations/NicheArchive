import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type FetchParams,
  type TranscriptConfig,
} from "youtube-transcript-plus";
import { fetchCaptions, pickEnglishTrack, type CaptionTrack } from "./captions";

// The library itself is replaced, but its error classes are the real ones,
// since the adapter tells failures apart with instanceof.
vi.mock("youtube-transcript-plus", async (importActual) => ({
  ...(await importActual<typeof import("youtube-transcript-plus")>()),
  fetchTranscript: vi.fn(),
}));

const manual = (languageCode: string): CaptionTrack => ({ languageCode });
const auto = (languageCode: string): CaptionTrack => ({ languageCode, kind: "asr" });

describe("pickEnglishTrack", () => {
  it("prefers the manual track over the auto-generated one, whichever comes first", () => {
    const manualEn = manual("en");
    expect(pickEnglishTrack([auto("en"), manualEn])).toBe(manualEn);
    expect(pickEnglishTrack([manualEn, auto("en")])).toBe(manualEn);
  });

  it("prefers a manual English variant over an auto-generated en track", () => {
    const manualGb = manual("en-GB");
    expect(pickEnglishTrack([auto("en"), manual("fr"), manualGb])).toBe(manualGb);
  });

  it("takes the first manual English track when there are several", () => {
    const manualUs = manual("en-US");
    expect(pickEnglishTrack([manualUs, manual("en"), manual("en-GB")])).toBe(manualUs);
  });

  it("falls back to the auto-generated English track", () => {
    const autoEn = auto("en");
    expect(pickEnglishTrack([manual("es"), autoEn, auto("de")])).toBe(autoEn);
  });

  it("treats kinds other than asr as manual", () => {
    const forced = { languageCode: "en", kind: "forced" };
    expect(pickEnglishTrack([auto("en"), forced])).toBe(forced);
  });

  it.each([
    [[]],
    [[manual("es"), auto("fr")]],
    [[manual("eng"), manual("enm"), manual("ben"), manual("xen")]],
  ])("returns null without an English track (%j)", (tracks) => {
    expect(pickEnglishTrack(tracks)).toBeNull();
  });

  it("matches English codes case-insensitively", () => {
    const upper = manual("EN-gb");
    expect(pickEnglishTrack([upper])).toBe(upper);
  });
});

describe("fetchCaptions", () => {
  const VIDEO_ID = "dQw4w9WgXcQ";

  // What the library passes to playerFetch for YouTube's player endpoint.
  const PLAYER_REQUEST: FetchParams = {
    url: "https://www.youtube.com/youtubei/v1/player",
    method: "POST",
    body: "{}",
    headers: { "Content-Type": "application/json" },
    userAgent: "test-agent",
  };

  const CUES = [
    { text: "We&#39;re no strangers", duration: 2, offset: 0, lang: "en" },
    { text: "to love", duration: 2, offset: 2, lang: "en" },
  ];

  type Library = Mock<(videoId: string, config: TranscriptConfig) => Promise<unknown>>;
  const library = fetchTranscript as unknown as Library;

  /** Tracks the adapter left in the player response for the library to use. */
  let tracksLeft: CaptionTrack[] | undefined;

  /** YouTube's player answers `body` with `status`. */
  function youtubePlayerAnswers(body: object, status = 200) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body, { status })),
    );
  }

  function playerWith(tracks: CaptionTrack[], playability: object = { status: "OK" }) {
    return {
      playabilityStatus: playability,
      captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
    };
  }

  /**
   * The library asks for the player through the adapter's playerFetch, as
   * the real one does, then returns `outcome` or throws it.
   */
  function libraryDoes(
    outcome: { cues: unknown[] } | { throws: unknown },
    { callsPlayer = true } = {},
  ) {
    library.mockImplementation(async (_videoId, config) => {
      if (callsPlayer) {
        const response = await config.playerFetch!(PLAYER_REQUEST);
        const player = response.ok ? await response.json() : null;
        tracksLeft = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      }
      if ("throws" in outcome) throw outcome.throws;
      return outcome.cues;
    });
  }

  beforeEach(() => {
    tracksLeft = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    library.mockReset();
  });

  it("reads the manual English track, leaving the library only that one", async () => {
    youtubePlayerAnswers(playerWith([auto("en"), manual("en"), manual("fr")]));
    libraryDoes({ cues: CUES });

    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: true,
      source: "manual_captions",
      segments: [
        { start: 0, duration: 2, text: "We're no strangers" },
        { start: 2, duration: 2, text: "to love" },
      ],
    });
    expect(tracksLeft).toEqual([manual("en")]);
  });

  it("reads the auto-generated track when there's no manual one", async () => {
    youtubePlayerAnswers(playerWith([auto("en")]));
    libraryDoes({ cues: CUES });
    expect(await fetchCaptions(VIDEO_ID)).toMatchObject({ ok: true, source: "auto_captions" });
    expect(tracksLeft).toEqual([auto("en")]);
  });

  it("sends the library's player request with its user agent and a time limit", async () => {
    youtubePlayerAnswers(playerWith([manual("en")]));
    libraryDoes({ cues: CUES });
    await fetchCaptions(VIDEO_ID);

    expect(library).toHaveBeenCalledWith(VIDEO_ID, {
      playerFetch: expect.any(Function),
      signal: expect.any(AbortSignal),
    });
    expect(fetch).toHaveBeenCalledWith(PLAYER_REQUEST.url, {
      method: "POST",
      body: "{}",
      headers: { "User-Agent": "test-agent", "Content-Type": "application/json" },
      signal: undefined,
    });
  });

  it("reports no English track, listing the languages there are", async () => {
    youtubePlayerAnswers(playerWith([manual("ko"), auto("ja")]));
    libraryDoes({ throws: new YoutubeTranscriptNotAvailableError(VIDEO_ID) });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "no_english_track",
      detail: "No English captions. Available: ko, ja.",
    });
    expect(tracksLeft).toEqual([]);
  });

  it("reports YouTube's bot check as unavailable, in YouTube's words", async () => {
    youtubePlayerAnswers({
      playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" },
    });
    libraryDoes({ throws: new YoutubeTranscriptNotAvailableError(VIDEO_ID) });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      detail: "YouTube said LOGIN_REQUIRED: Sign in to confirm you're not a bot.",
    });
  });

  it("reports rate limiting as unavailable", async () => {
    libraryDoes({ throws: new YoutubeTranscriptTooManyRequestError() }, { callsPlayer: false });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      detail: "YouTube is rate-limiting requests from this server.",
    });
  });

  it("reports a refused player request with its HTTP status", async () => {
    youtubePlayerAnswers({}, 403);
    libraryDoes({ throws: new YoutubeTranscriptVideoUnavailableError(VIDEO_ID) });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      detail: "YouTube's player API refused the request (HTTP 403).",
    });
  });

  it("reports a watch page that didn't load", async () => {
    libraryDoes(
      { throws: new YoutubeTranscriptVideoUnavailableError(VIDEO_ID) },
      { callsPlayer: false },
    );
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      detail: "YouTube's watch page didn't load.",
    });
  });

  it("reports disabled captions as no English track", async () => {
    youtubePlayerAnswers({ playabilityStatus: { status: "OK" } });
    libraryDoes({ throws: new YoutubeTranscriptDisabledError(VIDEO_ID) });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "no_english_track",
      detail: "This video has no captions.",
    });
  });

  it("reports an English track that came back empty", async () => {
    youtubePlayerAnswers(playerWith([manual("en")]));
    libraryDoes({ throws: new YoutubeTranscriptNotAvailableError(VIDEO_ID) });
    expect(await fetchCaptions(VIDEO_ID)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("reports a watch page with no player key as unavailable", async () => {
    libraryDoes(
      { throws: new YoutubeTranscriptNotAvailableError(VIDEO_ID) },
      { callsPlayer: false },
    );
    expect(await fetchCaptions(VIDEO_ID)).toMatchObject({
      ok: false,
      reason: "unavailable",
      detail: expect.stringContaining("no player API key"),
    });
  });

  it("reports a track with no text as empty", async () => {
    youtubePlayerAnswers(playerWith([manual("en")]));
    libraryDoes({ cues: [] });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "empty",
      detail: "The caption track had no text.",
    });
  });

  it("reports the time limit running out", async () => {
    libraryDoes(
      { throws: Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }) },
      { callsPlayer: false },
    );
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "error",
      detail: "YouTube didn't respond within 20 seconds.",
    });
  });

  it("reports anything else with its message", async () => {
    libraryDoes({ throws: new Error("Unexpected token < in JSON") }, { callsPlayer: false });
    expect(await fetchCaptions(VIDEO_ID)).toEqual({
      ok: false,
      reason: "error",
      detail: "Unexpected token < in JSON",
    });
  });
});

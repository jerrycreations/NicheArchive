import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySessionToken } from "@/lib/auth/session";
import {
  deleteVideoByYoutubeId,
  getVideoByYoutubeId,
  insertVideo,
} from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { SIGNED_OUT } from "@/lib/errors";
import { youTubeErrorMessage } from "@/lib/youtube/errors";
import { fetchVideoMetadata, type VideoMetadata } from "@/lib/youtube/metadata";
import { addVideo, deleteVideo } from "./videos";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Every request carries a cookie; verifySessionToken decides who, if anyone, it's for.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/auth/session", () => ({ SESSION_COOKIE: "na_session", verifySessionToken: vi.fn() }));
vi.mock("@/lib/youtube/metadata", () => ({ fetchVideoMetadata: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({
  getVideoByYoutubeId: vi.fn(),
  insertVideo: vi.fn(),
  deleteVideoByYoutubeId: vi.fn(),
}));

const ID = "dQw4w9WgXcQ";
const LINK = `https://youtu.be/${ID}?si=Ab12Cd34`;

const metadata: VideoMetadata = {
  youtubeId: ID,
  title: "How Bread Rises",
  channel: "The Kitchen Lab",
  durationSeconds: 247,
  publishedAt: new Date("2025-03-14T15:00:07Z"),
  privacyStatus: "public",
  liveBroadcastContent: "none",
};

function lookupReturns(changes: Partial<VideoMetadata>) {
  vi.mocked(fetchVideoMetadata).mockResolvedValue({
    ok: true,
    video: { ...metadata, ...changes },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifySessionToken).mockResolvedValue({ person: "Alex" });
  vi.mocked(getVideoByYoutubeId).mockResolvedValue(null);
  vi.mocked(fetchVideoMetadata).mockResolvedValue({ ok: true, video: metadata });
  vi.mocked(insertVideo).mockResolvedValue({ id: "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10" });
  vi.mocked(deleteVideoByYoutubeId).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("addVideo", () => {
  it("refuses a signed-out device without asking YouTube", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(await addVideo({ url: LINK, confirmLong: false })).toEqual({
      kind: "error",
      message: SIGNED_OUT,
    });
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
    expect(fetchVideoMetadata).not.toHaveBeenCalled();
  });

  it("saves a new video as pending and revalidates the library", async () => {
    expect(await addVideo({ url: LINK })).toEqual({
      kind: "added",
      youtubeId: ID,
      title: "How Bread Rises",
    });
    expect(fetchVideoMetadata).toHaveBeenCalledWith(ID);
    expect(insertVideo).toHaveBeenCalledWith({
      youtubeId: ID,
      title: "How Bread Rises",
      channel: "The Kitchen Lab",
      durationSeconds: 247,
      publishedAt: metadata.publishedAt,
      privacyStatus: "public",
      status: "pending",
    });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/library");
  });

  it.each([
    ["", "empty"],
    ["https://vimeo.com/76979871", "not_youtube"],
    ["https://www.youtube.com/@thekitchenlab", "no_video_id"],
  ] as const)("rejects %j as invalid (%s) without a lookup", async (url, reason) => {
    expect(await addVideo({ url })).toEqual({ kind: "invalid_url", reason });
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
    expect(fetchVideoMetadata).not.toHaveBeenCalled();
  });

  it("rejects input that isn't a URL string", async () => {
    expect(await addVideo({ url: 42 } as never)).toEqual({
      kind: "invalid_url",
      reason: "not_youtube",
    });
    expect(await addVideo({ url: "x".repeat(2049) })).toEqual({
      kind: "invalid_url",
      reason: "not_youtube",
    });
  });

  it("says a saved video already exists without asking YouTube", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue({
      youtubeId: ID,
      title: "How Bread Rises (saved)",
    } as VideoRow);

    expect(await addVideo({ url: LINK })).toEqual({
      kind: "already_exists",
      youtubeId: ID,
      title: "How Bread Rises (saved)",
    });
    expect(fetchVideoMetadata).not.toHaveBeenCalled();
    expect(insertVideo).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["not_found", "live_or_upcoming", "quota_exceeded"] as const)(
    "passes %s through for the form to explain",
    async (error) => {
      vi.mocked(fetchVideoMetadata).mockResolvedValue({ ok: false, error, detail: "test" });
      expect(await addVideo({ url: LINK })).toEqual({ kind: error });
      expect(insertVideo).not.toHaveBeenCalled();
    },
  );

  it.each(["bad_key", "network", "unexpected"] as const)(
    "turns %s into an error message and logs the detail",
    async (error) => {
      vi.mocked(fetchVideoMetadata).mockResolvedValue({
        ok: false,
        error,
        detail: "HTTP 400 API_KEY_INVALID",
      });
      expect(await addVideo({ url: LINK })).toEqual({
        kind: "error",
        message: youTubeErrorMessage(error),
      });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("HTTP 400 API_KEY_INVALID"),
      );
      expect(insertVideo).not.toHaveBeenCalled();
    },
  );

  it("asks before adding a video over 30 minutes", async () => {
    lookupReturns({ durationSeconds: 1801 });
    expect(await addVideo({ url: LINK })).toEqual({
      kind: "needs_confirmation",
      title: "How Bread Rises",
      durationSeconds: 1801,
    });
    expect(insertVideo).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("adds a video of exactly 30 minutes without asking", async () => {
    lookupReturns({ durationSeconds: 1800 });
    expect(await addVideo({ url: LINK })).toMatchObject({ kind: "added" });
  });

  it("adds a long video once the user has confirmed", async () => {
    lookupReturns({ durationSeconds: 5400 });
    expect(await addVideo({ url: LINK, confirmLong: true })).toMatchObject({ kind: "added" });
    expect(insertVideo).toHaveBeenCalledWith(expect.objectContaining({ durationSeconds: 5400 }));
  });

  it("reports a lost insert race as already saved", async () => {
    vi.mocked(insertVideo).mockResolvedValue(null);
    expect(await addVideo({ url: LINK })).toEqual({
      kind: "already_exists",
      youtubeId: ID,
      title: "How Bread Rises",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["the lookup", () => vi.mocked(getVideoByYoutubeId).mockRejectedValue(new Error("ECONNREFUSED"))],
    ["the insert", () => vi.mocked(insertVideo).mockRejectedValue(new Error("ECONNREFUSED"))],
  ])("returns a generic error when the database fails during %s", async (_, fail) => {
    fail();
    expect(await addVideo({ url: LINK })).toEqual({
      kind: "error",
      message: "Something went wrong on the server. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith("addVideo failed:", expect.any(Error));
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deleteVideo", () => {
  it("refuses a signed-out device", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(await deleteVideo(ID)).toEqual({ kind: "error", message: SIGNED_OUT });
    expect(deleteVideoByYoutubeId).not.toHaveBeenCalled();
  });

  it("deletes the video and revalidates the library", async () => {
    expect(await deleteVideo(ID)).toEqual({ kind: "deleted" });
    expect(deleteVideoByYoutubeId).toHaveBeenCalledExactlyOnceWith(ID);
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/library");
  });

  it("treats a video that's already gone as deleted", async () => {
    vi.mocked(deleteVideoByYoutubeId).mockResolvedValue(false);
    expect(await deleteVideo(ID)).toEqual({ kind: "deleted" });
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/library");
  });

  it.each(["", "not-an-id", `${ID}X`, "../library"])(
    "refuses %j without touching the database",
    async (youtubeId) => {
      expect(await deleteVideo(youtubeId)).toEqual({
        kind: "error",
        message: "That isn't a saved video.",
      });
      expect(deleteVideoByYoutubeId).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("returns an error and keeps the page as it was when the database fails", async () => {
    vi.mocked(deleteVideoByYoutubeId).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await deleteVideo(ID)).toEqual({
      kind: "error",
      message: "Couldn't delete the video. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith("deleteVideo failed:", expect.any(Error));
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

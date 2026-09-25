import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeWithGemini } from "@/lib/ai/transcribe";
import { markTranscriptFailed, writeTranscript } from "@/lib/db/queries/videos";
import { indexVideo } from "@/lib/search/index-video";
import { fetchCaptions } from "@/lib/youtube/captions";
import {
  GEMINI_PUBLIC_ONLY,
  ONLY_SOUND_LABELS,
  PROCESSING_CRASHED,
  processVideoTranscript,
  resolveTranscript,
  type PipelineVideo,
} from "./pipeline";

vi.mock("@/lib/youtube/captions", () => ({ fetchCaptions: vi.fn() }));
vi.mock("@/lib/ai/transcribe", () => ({ transcribeWithGemini: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({
  writeTranscript: vi.fn(),
  markTranscriptFailed: vi.fn(),
}));
vi.mock("@/lib/search/index-video", () => ({ indexVideo: vi.fn() }));

const VIDEO: PipelineVideo = {
  id: "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10",
  youtubeId: "dQw4w9WgXcQ",
  durationSeconds: 214,
  privacyStatus: "public",
};
const CLAIMED_AT = new Date("2026-09-24T12:00:00.123Z");

const speech = [
  { start: 18, duration: 3.5, text: "We're no strangers to love" },
  { start: 21.5, duration: 4, text: "You know the rules and so do I" },
];

const noCaptions = {
  ok: false,
  reason: "no_english_track",
  detail: "This video has no captions.",
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(writeTranscript).mockResolvedValue(true);
  vi.mocked(markTranscriptFailed).mockResolvedValue(true);
  vi.mocked(indexVideo).mockResolvedValue({ kind: "indexed", chunkCount: 1 });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveTranscript", () => {
  it("uses the captions when there are some, without asking Gemini", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ ok: true, source: "manual_captions", segments: speech });
    expect(await resolveTranscript(VIDEO)).toEqual({
      ok: true,
      source: "manual_captions",
      segments: speech,
    });
    expect(transcribeWithGemini).not.toHaveBeenCalled();
  });

  it("drops sound labels from the captions", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({
      ok: true,
      source: "auto_captions",
      segments: [{ start: 0, duration: 18, text: "[Music]" }, ...speech],
    });
    expect(await resolveTranscript(VIDEO)).toMatchObject({ ok: true, segments: speech });
  });

  it("moves on to Gemini when the captions are only sound labels", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({
      ok: true,
      source: "auto_captions",
      segments: [{ start: 0, duration: 214, text: "[Music]" }],
    });
    vi.mocked(transcribeWithGemini).mockResolvedValue({ ok: true, source: "gemini", segments: speech });

    expect(await resolveTranscript(VIDEO)).toEqual({ ok: true, source: "gemini", segments: speech });
    expect(transcribeWithGemini).toHaveBeenCalledWith({
      youtubeId: "dQw4w9WgXcQ",
      durationSeconds: 214,
    });
  });

  it("moves on to Gemini when there are no captions", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue(noCaptions);
    vi.mocked(transcribeWithGemini).mockResolvedValue({ ok: true, source: "gemini", segments: speech });
    expect(await resolveTranscript(VIDEO)).toMatchObject({ ok: true, source: "gemini" });
  });

  it("skips Gemini for a video that isn't public", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue(noCaptions);
    expect(await resolveTranscript({ ...VIDEO, privacyStatus: "unlisted" })).toEqual({
      ok: false,
      reasons: [
        { stage: "captions", message: "This video has no captions." },
        { stage: "gemini", message: GEMINI_PUBLIC_ONLY },
      ],
    });
    expect(transcribeWithGemini).not.toHaveBeenCalled();
  });

  it("gives each source's reason when both fail", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({
      ok: false,
      reason: "unavailable",
      detail: "YouTube said LOGIN_REQUIRED: Sign in to confirm you're not a bot.",
    });
    vi.mocked(transcribeWithGemini).mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      message: "Gemini's free limit was reached. Try again in a minute.",
      detail: "AI_APICallError: quota",
    });
    expect(await resolveTranscript(VIDEO)).toEqual({
      ok: false,
      reasons: [
        {
          stage: "captions",
          message: "YouTube said LOGIN_REQUIRED: Sign in to confirm you're not a bot.",
        },
        { stage: "gemini", message: "Gemini's free limit was reached. Try again in a minute." },
      ],
    });
  });

  it("fails when Gemini's transcript is only sound labels too", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue(noCaptions);
    vi.mocked(transcribeWithGemini).mockResolvedValue({
      ok: true,
      source: "gemini",
      segments: [{ start: 0, duration: 5, text: "(upbeat music)" }],
    });
    expect(await resolveTranscript(VIDEO)).toMatchObject({
      ok: false,
      reasons: [{ stage: "captions" }, { stage: "gemini", message: ONLY_SOUND_LABELS }],
    });
  });
});

describe("processVideoTranscript", () => {
  it("saves the transcript with its plain text under the run's claim", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ ok: true, source: "auto_captions", segments: speech });
    await processVideoTranscript(VIDEO, CLAIMED_AT);
    expect(writeTranscript).toHaveBeenCalledExactlyOnceWith(
      VIDEO.id,
      {
        segments: speech,
        text: "We're no strangers to love You know the rules and so do I",
        source: "auto_captions",
        timestampsEstimated: false,
      },
      { claimedAt: CLAIMED_AT },
    );
    expect(markTranscriptFailed).not.toHaveBeenCalled();
  });

  it("indexes the video once the transcript is saved, within the route's time", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ ok: true, source: "auto_captions", segments: speech });
    // Claimed 60 seconds ago: about 230 of the 290 seconds are left.
    const claimedAt = new Date(Date.now() - 60_000);
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await processVideoTranscript(VIDEO, claimedAt);

    expect(indexVideo).toHaveBeenCalledExactlyOnceWith(VIDEO.id, {
      abortSignal: expect.any(AbortSignal),
    });
    expect(vi.mocked(writeTranscript).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(indexVideo).mock.invocationCallOrder[0],
    );
    expect(timeout.mock.calls[0][0]).toBeGreaterThan(229_000);
    expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(230_000);
  });

  it("marks the video failed with one line per source", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue(noCaptions);
    await processVideoTranscript({ ...VIDEO, privacyStatus: "private" }, CLAIMED_AT);
    expect(markTranscriptFailed).toHaveBeenCalledExactlyOnceWith(
      VIDEO.id,
      CLAIMED_AT,
      `Captions: This video has no captions.\nGemini: ${GEMINI_PUBLIC_ONLY}`,
    );
    expect(writeTranscript).not.toHaveBeenCalled();
    expect(indexVideo).not.toHaveBeenCalled();
  });

  it("logs and moves on when a paste or a newer run took the video over", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ ok: true, source: "manual_captions", segments: speech });
    vi.mocked(writeTranscript).mockResolvedValue(false);
    await expect(processVideoTranscript(VIDEO, CLAIMED_AT)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("took over"));
    expect(indexVideo).not.toHaveBeenCalled();
  });

  it("marks the video failed when something throws", async () => {
    vi.mocked(fetchCaptions).mockRejectedValue(new Error("ECONNRESET"));
    await processVideoTranscript(VIDEO, CLAIMED_AT);
    expect(markTranscriptFailed).toHaveBeenCalledExactlyOnceWith(
      VIDEO.id,
      CLAIMED_AT,
      PROCESSING_CRASHED,
    );
  });

  it("never throws, even when marking the failure fails", async () => {
    vi.mocked(fetchCaptions).mockResolvedValue({ ok: true, source: "manual_captions", segments: speech });
    vi.mocked(writeTranscript).mockRejectedValue(new Error("Can't reach the database"));
    vi.mocked(markTranscriptFailed).mockRejectedValue(new Error("Can't reach the database"));
    await expect(processVideoTranscript(VIDEO, CLAIMED_AT)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

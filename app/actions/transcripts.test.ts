import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySessionToken } from "@/lib/auth/session";
import { MAX_PASTED_TRANSCRIPT_CHARS } from "@/lib/constants";
import { getVideoByYoutubeId, writeTranscript } from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { SIGNED_OUT } from "@/lib/errors";
import { indexVideo } from "@/lib/search/index-video";
import { NOT_A_TRANSCRIPT, TRANSCRIPT_TOO_LONG } from "@/lib/transcript/parse-pasted";
import { savePastedTranscript } from "./transcripts";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Every request carries a cookie; verifySessionToken decides who, if anyone, it's for.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/auth/session", () => ({ SESSION_COOKIE: "na_session", verifySessionToken: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/search/index-video", () => ({ indexVideo: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({
  getVideoByYoutubeId: vi.fn(),
  writeTranscript: vi.fn(),
}));

const ID = "dQw4w9WgXcQ";
const VIDEO = { id: "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10", youtubeId: ID, durationSeconds: 214 } as VideoRow;

const SENTENCE = "The dough rises because yeast turns sugar into gas.";
const TIMED = `0:00 ${SENTENCE}\n0:05 ${SENTENCE}\n0:10 ${SENTENCE}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifySessionToken).mockResolvedValue({ person: "Alex" });
  vi.mocked(getVideoByYoutubeId).mockResolvedValue(VIDEO);
  vi.mocked(writeTranscript).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("savePastedTranscript", () => {
  it("refuses a signed-out device without touching the database", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(await savePastedTranscript({ youtubeId: ID, text: TIMED })).toEqual({
      kind: "error",
      message: SIGNED_OUT,
    });
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
    expect(writeTranscript).not.toHaveBeenCalled();
  });

  it("saves a timed paste as ready, without a claim, and refreshes the pages", async () => {
    expect(await savePastedTranscript({ youtubeId: ID, text: TIMED })).toEqual({ kind: "saved" });

    expect(writeTranscript).toHaveBeenCalledExactlyOnceWith(VIDEO.id, {
      segments: [
        { start: 0, duration: 5, text: SENTENCE },
        { start: 5, duration: 5, text: SENTENCE },
        { start: 10, duration: 9 / 2.5, text: SENTENCE },
      ],
      text: `${SENTENCE} ${SENTENCE} ${SENTENCE}`,
      source: "pasted",
      timestampsEstimated: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/library");
    expect(revalidatePath).toHaveBeenCalledWith(`/videos/${ID}`);
  });

  it("rebuilds the search index after the response", async () => {
    await savePastedTranscript({ youtubeId: ID, text: TIMED });
    expect(indexVideo).not.toHaveBeenCalled();

    const [[work]] = vi.mocked(after).mock.calls;
    await (work as () => Promise<unknown>)();
    expect(indexVideo).toHaveBeenCalledExactlyOnceWith(VIDEO.id);
  });

  it("doesn't index a video deleted while the paste was saving", async () => {
    vi.mocked(writeTranscript).mockResolvedValue(false);
    await savePastedTranscript({ youtubeId: ID, text: TIMED });
    expect(after).not.toHaveBeenCalled();
  });

  it("marks the times as estimated when the paste has none", async () => {
    const text = Array.from({ length: 4 }, () => SENTENCE).join(" ");
    expect(await savePastedTranscript({ youtubeId: ID, text })).toEqual({ kind: "saved" });
    expect(writeTranscript).toHaveBeenCalledWith(
      VIDEO.id,
      expect.objectContaining({ source: "pasted", timestampsEstimated: true }),
    );
  });

  it("explains a paste that doesn't look like a transcript and saves nothing", async () => {
    expect(await savePastedTranscript({ youtubeId: ID, text: "Thanks for watching!" })).toEqual({
      kind: "invalid_transcript",
      message: NOT_A_TRANSCRIPT,
    });
    expect(writeTranscript).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a paste over the size limit without touching the database", async () => {
    const text = "word ".repeat(MAX_PASTED_TRANSCRIPT_CHARS / 5 + 1);
    expect(await savePastedTranscript({ youtubeId: ID, text })).toEqual({
      kind: "invalid_transcript",
      message: TRANSCRIPT_TOO_LONG,
    });
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
  });

  it("refuses an ID that isn't a video ID", async () => {
    expect(await savePastedTranscript({ youtubeId: "../library", text: TIMED })).toEqual({
      kind: "error",
      message: "That isn't a saved video.",
    });
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
  });

  it("says so when the video was deleted", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue(null);
    expect(await savePastedTranscript({ youtubeId: ID, text: TIMED })).toEqual({
      kind: "error",
      message: "This video isn't in the library anymore.",
    });
    expect(writeTranscript).not.toHaveBeenCalled();
  });

  it("returns an error when the database fails", async () => {
    vi.mocked(writeTranscript).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await savePastedTranscript({ youtubeId: ID, text: TIMED })).toEqual({
      kind: "error",
      message: "Couldn't save the transcript. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith("savePastedTranscript failed:", expect.any(Error));
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

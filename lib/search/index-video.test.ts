import { createHash } from "node:crypto";
import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedDocuments, EmbeddingConfigError } from "@/lib/ai/embed";
import { aiErrorMessage } from "@/lib/ai/errors";
import { embeddingModelId } from "@/lib/ai/models";
import { markIndexFailed, replaceVideoChunks } from "@/lib/db/queries/chunks";
import { getVideoById } from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { INDEX_SAVE_FAILED, INDEX_TIMED_OUT, indexVideo } from "./index-video";

vi.mock("@/lib/ai/embed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/embed")>()),
  embedDocuments: vi.fn(),
}));
vi.mock("@/lib/ai/models", () => ({ embeddingModelId: vi.fn() }));
vi.mock("@/lib/db/queries/chunks", () => ({ replaceVideoChunks: vi.fn(), markIndexFailed: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({ getVideoById: vi.fn() }));

const TEXT = "Yeast eats sugar. It makes gas.";
const HASH = createHash("md5").update(TEXT).digest("hex");

const VIDEO = {
  id: "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10",
  youtubeId: "dQw4w9WgXcQ",
  title: "How Bread Rises",
  channel: "The Kitchen Lab",
  status: "ready",
  transcriptSegments: [
    { start: 0, duration: 4, text: "Yeast eats sugar." },
    { start: 4, duration: 3, text: "It makes gas." },
  ],
  transcriptText: TEXT,
} as VideoRow;

const EMBEDDING = [0.6, 0.8];

function rateLimited(retryAfter: string) {
  return new APICallError({
    message: "Quota exceeded",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents",
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: { "retry-after": retryAfter },
    isRetryable: true,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getVideoById).mockResolvedValue(VIDEO);
  vi.mocked(embeddingModelId).mockReturnValue("gemini-embedding-2");
  vi.mocked(embedDocuments).mockImplementation(async (documents) => documents.map(() => EMBEDDING));
  vi.mocked(replaceVideoChunks).mockResolvedValue(true);
  vi.mocked(markIndexFailed).mockResolvedValue(true);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("indexVideo", () => {
  it("chunks and embeds the transcript under the video's title, then swaps the chunks in", async () => {
    expect(await indexVideo(VIDEO.id)).toEqual({ kind: "indexed", chunkCount: 1 });

    expect(embedDocuments).toHaveBeenCalledExactlyOnceWith(
      [{ title: "How Bread Rises (The Kitchen Lab)", text: TEXT }],
      { abortSignal: expect.any(AbortSignal) },
    );
    expect(replaceVideoChunks).toHaveBeenCalledExactlyOnceWith(
      VIDEO.id,
      HASH,
      [{ position: 0, startSeconds: 0, endSeconds: 7, text: TEXT, embedding: EMBEDDING }],
      "gemini-embedding-2",
    );
    expect(markIndexFailed).not.toHaveBeenCalled();
  });

  it("does nothing for a video that's gone or not ready", async () => {
    vi.mocked(getVideoById).mockResolvedValueOnce(null);
    expect(await indexVideo(VIDEO.id)).toEqual({ kind: "not_ready" });

    vi.mocked(getVideoById).mockResolvedValueOnce({ ...VIDEO, status: "failed" });
    expect(await indexVideo(VIDEO.id)).toEqual({ kind: "not_ready" });

    expect(embedDocuments).not.toHaveBeenCalled();
    expect(replaceVideoChunks).not.toHaveBeenCalled();
  });

  it("drops its result when the transcript changed while it worked", async () => {
    vi.mocked(replaceVideoChunks).mockResolvedValue(false);
    expect(await indexVideo(VIDEO.id)).toEqual({ kind: "superseded" });
    expect(markIndexFailed).not.toHaveBeenCalled();
  });

  it("records a rate limit as the index error, with Google's wait", async () => {
    vi.mocked(embedDocuments).mockRejectedValue(rateLimited("40"));

    expect(await indexVideo(VIDEO.id)).toEqual({
      kind: "failed",
      failure: {
        reason: "rate_limited",
        message: aiErrorMessage("rate_limited"),
        retryAfterSeconds: 40,
      },
    });
    expect(markIndexFailed).toHaveBeenCalledExactlyOnceWith(
      VIDEO.id,
      HASH,
      aiErrorMessage("rate_limited"),
    );
    expect(replaceVideoChunks).not.toHaveBeenCalled();
  });

  it("records embedding settings that don't fit the database", async () => {
    const error = new EmbeddingConfigError("The embedding model returned vectors of 3072 numbers…");
    vi.mocked(embedDocuments).mockRejectedValue(error);

    expect(await indexVideo(VIDEO.id)).toEqual({
      kind: "failed",
      failure: { reason: "config", message: error.message },
    });
    expect(markIndexFailed).toHaveBeenCalledWith(VIDEO.id, HASH, error.message);
  });

  it("records running out of time", async () => {
    const controller = new AbortController();
    vi.mocked(embedDocuments).mockImplementation(async () => {
      controller.abort(new DOMException("Timed out", "TimeoutError"));
      throw controller.signal.reason;
    });

    expect(await indexVideo(VIDEO.id, { abortSignal: controller.signal })).toEqual({
      kind: "failed",
      failure: { reason: "timeout", message: INDEX_TIMED_OUT },
    });
  });

  it("records a failed database write", async () => {
    vi.mocked(replaceVideoChunks).mockRejectedValue(new Error("Connection terminated"));
    expect(await indexVideo(VIDEO.id)).toEqual({
      kind: "failed",
      failure: { reason: "database", message: INDEX_SAVE_FAILED },
    });
    expect(markIndexFailed).toHaveBeenCalledWith(VIDEO.id, HASH, INDEX_SAVE_FAILED);
  });

  it("never throws, even when recording the failure fails", async () => {
    vi.mocked(embedDocuments).mockRejectedValue(new Error("socket hang up"));
    vi.mocked(markIndexFailed).mockRejectedValue(new Error("Connection terminated"));

    await expect(indexVideo(VIDEO.id)).resolves.toMatchObject({ kind: "failed" });

    vi.mocked(getVideoById).mockRejectedValue(new Error("Connection terminated"));
    await expect(indexVideo(VIDEO.id)).resolves.toMatchObject({ kind: "failed" });
  });
});

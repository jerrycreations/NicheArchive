import "server-only";
import { createHash } from "node:crypto";
import { embedDocuments, EmbeddingConfigError } from "@/lib/ai/embed";
import { aiErrorText, classifyAiError } from "@/lib/ai/errors";
import { embeddingModelId } from "@/lib/ai/models";
import { markIndexFailed, replaceVideoChunks } from "@/lib/db/queries/chunks";
import { getVideoById } from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { chunkTranscript } from "@/lib/search/chunk";
import { buildChunkEmbeddingInput } from "@/lib/search/embedding-input";
import type { IndexFailure } from "@/lib/search/index-types";

/** Leaves 20 of a function's 300 seconds to record a failure. */
export const INDEX_TIME_LIMIT_MS = 280_000;

export const INDEX_TIMED_OUT = "Indexing took too long. Try again.";
export const INDEX_SAVE_FAILED = "Couldn't save the search index. Try again.";

export type IndexVideoResult =
  | { kind: "indexed"; chunkCount: number }
  /** The video is gone or its transcript isn't ready. */
  | { kind: "not_ready" }
  /** The transcript changed while this run worked; the run for the new one indexes it. */
  | { kind: "superseded" }
  | { kind: "failed"; failure: IndexFailure };

/**
 * Builds a ready video's library search index: chunks its transcript, embeds
 * the chunks and swaps them in for the old ones. A failure is saved as the
 * video's index_error and leaves its transcript `ready`. Never throws, so it
 * can run in after() work.
 */
export async function indexVideo(
  videoId: string,
  { abortSignal = AbortSignal.timeout(INDEX_TIME_LIMIT_MS) }: { abortSignal?: AbortSignal } = {},
): Promise<IndexVideoResult> {
  let loaded: VideoRow | null;
  try {
    loaded = await getVideoById(videoId);
  } catch (error) {
    console.error(`Index ${videoId}: couldn't load the video:`, error);
    return { kind: "failed", failure: { reason: "database", message: INDEX_SAVE_FAILED } };
  }
  if (!loaded || loaded.status !== "ready") return { kind: "not_ready" };
  const video = loaded;
  const { transcriptSegments, transcriptText } = video;
  if (!transcriptSegments || transcriptText === null) return { kind: "not_ready" };

  const started = performance.now();
  const transcriptHash = md5(transcriptText);
  const chunks = chunkTranscript(transcriptSegments);

  let model: string;
  let embeddings: number[][];
  try {
    model = embeddingModelId();
    embeddings = await embedDocuments(
      chunks.map((chunk) => buildChunkEmbeddingInput(video, chunk)),
      { abortSignal },
    );
  } catch (error) {
    return fail(video, transcriptHash, embeddingFailure(error, abortSignal), error);
  }

  try {
    const saved = await replaceVideoChunks(
      video.id,
      transcriptHash,
      chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] })),
      model,
    );
    if (!saved) {
      console.warn(`Index ${video.youtubeId}: the transcript changed while indexing, so this run was dropped.`);
      return { kind: "superseded" };
    }
  } catch (error) {
    return fail(video, transcriptHash, { reason: "database", message: INDEX_SAVE_FAILED }, error);
  }

  const ms = Math.round(performance.now() - started);
  console.info(`Index ${video.youtubeId}: ${chunks.length} chunks with ${model} in ${ms} ms`);
  return { kind: "indexed", chunkCount: chunks.length };
}

function embeddingFailure(error: unknown, abortSignal: AbortSignal): IndexFailure {
  if (error instanceof EmbeddingConfigError) return { reason: "config", message: error.message };
  if (abortSignal.aborted) return { reason: "timeout", message: INDEX_TIMED_OUT };
  const classified = classifyAiError(error);
  const failure: IndexFailure = { reason: classified.kind, message: aiErrorText(classified) };
  if (classified.kind === "rate_limited") {
    if (classified.retryAfterSeconds !== undefined) failure.retryAfterSeconds = classified.retryAfterSeconds;
    if (classified.daily) failure.daily = true;
  }
  return failure;
}

async function fail(
  video: VideoRow,
  transcriptHash: string,
  failure: IndexFailure,
  error: unknown,
): Promise<IndexVideoResult> {
  console.error(`Index ${video.youtubeId}: ${failure.reason}:`, error);
  await markIndexFailed(video.id, transcriptHash, failure.message).catch((markError: unknown) =>
    console.error(`Index ${video.youtubeId}: couldn't record the failure:`, markError),
  );
  return { kind: "failed", failure };
}

/** md5 of the text's UTF-8 bytes, as Postgres's md5() computes it. */
function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

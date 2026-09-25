import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { transcriptChunks, videos } from "@/lib/db/schema";
import type { NewTranscriptChunk } from "@/lib/db/types";

/** Rows per insert: each carries a 768-number vector, so this keeps statements a few MB at most. */
const INSERT_BATCH_SIZE = 100;

export type ChunkValues = Omit<NewTranscriptChunk, "id" | "videoId">;

// Whether the video's transcript is still the one with this md5. A run
// records the hash of the transcript it chunked, so it can tell when a paste
// has replaced the transcript since.
const transcriptMatches = (transcriptHash: string) =>
  sql`md5(${videos.transcriptText}) = ${transcriptHash}`;

/**
 * Replaces a video's search chunks and records the embedding model, in one
 * transaction. Only lands while the video is ready with the transcript
 * `transcriptHash` came from: when a paste has replaced it since, this
 * returns false and writes nothing, since the run for the new transcript
 * indexes that one. The row lock keeps a paste from landing mid-write.
 */
export async function replaceVideoChunks(
  videoId: string,
  transcriptHash: string,
  chunks: readonly ChunkValues[],
  model: string,
): Promise<boolean> {
  return db().transaction(async (tx) => {
    const [current] = await tx
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(eq(videos.id, videoId), eq(videos.status, "ready"), transcriptMatches(transcriptHash)),
      )
      .for("update");
    if (!current) return false;

    await tx.delete(transcriptChunks).where(eq(transcriptChunks.videoId, videoId));
    for (let from = 0; from < chunks.length; from += INSERT_BATCH_SIZE) {
      await tx
        .insert(transcriptChunks)
        .values(chunks.slice(from, from + INSERT_BATCH_SIZE).map((chunk) => ({ ...chunk, videoId })));
    }
    await tx
      .update(videos)
      .set({ indexedAt: sql`now()`, indexedModel: model, indexError: null })
      .where(eq(videos.id, videoId));
    return true;
  });
}

/**
 * Records why indexing failed, keeping the transcript's `ready` status and
 * any older chunks. Like replaceVideoChunks, it only lands while the
 * transcript is still the one that failed. Returns whether it landed.
 */
export async function markIndexFailed(
  videoId: string,
  transcriptHash: string,
  message: string,
): Promise<boolean> {
  const updated = await db()
    .update(videos)
    .set({ indexError: message })
    .where(and(eq(videos.id, videoId), transcriptMatches(transcriptHash)))
    .returning({ id: videos.id });
  return updated.length > 0;
}

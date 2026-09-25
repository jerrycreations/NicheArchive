import type { EmbeddingDocument } from "@/lib/ai/embed";
import type { VideoRow } from "@/lib/db/types";
import type { TranscriptChunk } from "@/lib/search/chunk";

/**
 * What the search index embeds for a chunk: its words under the video's
 * title and channel. A question that names the video's topic or channel then
 * matches chunks that never say either.
 */
export function buildChunkEmbeddingInput(
  video: Pick<VideoRow, "title" | "channel">,
  chunk: Pick<TranscriptChunk, "text">,
): EmbeddingDocument {
  return { title: `${video.title} (${video.channel})`, text: chunk.text };
}

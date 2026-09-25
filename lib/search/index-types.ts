import type { AiErrorKind } from "@/lib/ai/errors";

/**
 * Why indexing a video failed: a Gemini error, embedding settings that don't
 * fit the database, running out of time, or the database write.
 */
export type IndexFailureReason = AiErrorKind | "config" | "timeout" | "database";

export type IndexFailure = {
  reason: IndexFailureReason;
  /** Written for the user; also saved as the video's index_error. */
  message: string;
  /** For `rate_limited`: how long Google asked to wait. */
  retryAfterSeconds?: number;
  /** For `rate_limited`: the daily quota ran out, so waiting a minute won't help. */
  daily?: boolean;
};

/** What POST /api/index/[youtubeId] answers. */
export type IndexResponse =
  | { outcome: "indexed"; chunkCount: number }
  | { outcome: "not_found" }
  /** The transcript isn't ready, so there's nothing to index. */
  | { outcome: "not_ready" }
  /** The transcript changed while indexing; the run for the new one indexes it. */
  | { outcome: "superseded" }
  | ({ outcome: "failed" } & IndexFailure);

/** What GET /api/index/pending answers: the ready videos to index, or why it can't tell. */
export type IndexPendingResponse = { youtubeIds: string[] } | { error: string };

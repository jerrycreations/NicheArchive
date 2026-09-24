// Transcript status as people should see it, and the reasons stored when
// fetching one fails. No server code, so client components use these too.
import { STALE_PROCESSING_MINUTES } from "@/lib/constants";
import type { TranscriptSource, TranscriptStatus } from "@/lib/transcript/types";

const STALE_MS = STALE_PROCESSING_MINUTES * 60_000;

/** Shown for processing that stalled, say because the server stopped mid-way. */
export const STALLED_MESSAGE = "Getting the transcript took too long and was stopped.";

/** A processing claim older than this has stalled, and the video can be claimed again. */
export function staleCutoff(now: Date): Date {
  return new Date(now.getTime() - STALE_MS);
}

/**
 * The status to show. A pending video whose processing claim is older than
 * STALE_PROCESSING_MINUTES has stalled, since the processing route can't run
 * that long, so it reads as failed and offers a retry.
 */
export function effectiveStatus(
  video: {
    status: TranscriptStatus;
    processingStartedAt: Date | null;
    errorMessage?: string | null;
  },
  now: Date,
): { status: TranscriptStatus; errorMessage: string | null } {
  const { status, processingStartedAt } = video;
  if (status === "pending" && processingStartedAt && processingStartedAt < staleCutoff(now)) {
    return { status: "failed", errorMessage: STALLED_MESSAGE };
  }
  return { status, errorMessage: status === "failed" ? (video.errorMessage ?? null) : null };
}

/** A video's transcript state, as GET /api/videos/status reports it. */
export type TranscriptStatusInfo = {
  youtubeId: string;
  status: TranscriptStatus;
  source: TranscriptSource | null;
  errorMessage: string | null;
};

/** What POST /api/transcripts/process did. */
export type ProcessOutcome = "started" | "already_running" | "ready" | "not_found";

export type ProcessResponse = { outcome: ProcessOutcome };

/** The automatic sources, tried in this order before the user pastes a transcript. */
export type TranscriptStage = "captions" | "gemini";

export type StageReason = { stage: TranscriptStage; message: string };

const STAGE_LABELS: Record<TranscriptStage, string> = {
  captions: "Captions",
  gemini: "Gemini",
};

/** Why each source failed, stored in `error_message` one line per stage: "Captions: …". */
export function formatStageReasons(reasons: readonly StageReason[]): string {
  return reasons
    .map(({ stage, message }) => `${STAGE_LABELS[stage]}: ${message.replace(/\s+/g, " ").trim()}`)
    .join("\n");
}

/** Reads `error_message` back as lines, each with its stage's label when it has one. */
export function parseStageReasons(
  errorMessage: string,
): { label: string | null; message: string }[] {
  const labels = Object.values(STAGE_LABELS);
  return errorMessage
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const label = labels.find((candidate) => line.startsWith(`${candidate}: `));
      return label
        ? { label, message: line.slice(label.length + 2) }
        : { label: null, message: line };
    });
}

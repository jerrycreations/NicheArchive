import "server-only";
import { transcribeWithGemini } from "@/lib/ai/transcribe";
import { markTranscriptFailed, writeTranscript } from "@/lib/db/queries/videos";
import type { VideoRow } from "@/lib/db/types";
import { formatStageReasons, type StageReason } from "@/lib/transcript/status";
import { cleanSegments, segmentsToPlainText } from "@/lib/transcript/text";
import type { TranscriptSegment, TranscriptSource } from "@/lib/transcript/types";
import { fetchCaptions } from "@/lib/youtube/captions";

// Callers must run on the Node.js runtime (`runtime = "nodejs"`), which the
// caption adapter needs.

export type PipelineVideo = Pick<VideoRow, "id" | "youtubeId" | "durationSeconds" | "privacyStatus">;

export type ResolvedTranscript =
  | { ok: true; source: TranscriptSource; segments: TranscriptSegment[] }
  /** Every automatic source failed; the user can paste the transcript instead. */
  | { ok: false; reasons: StageReason[] };

export const GEMINI_PUBLIC_ONLY = "Gemini can only transcribe public videos.";
export const ONLY_SOUND_LABELS = "Only sound labels such as [Music], no speech.";
export const PROCESSING_CRASHED = "Something went wrong while getting the transcript. Try again.";

/**
 * Tries the automatic transcript sources in order: the video's own English
 * captions, then Gemini for public videos. Returns the first one that has
 * speech in it, or why each one failed or was skipped.
 */
export async function resolveTranscript(video: PipelineVideo): Promise<ResolvedTranscript> {
  const reasons: StageReason[] = [];

  const captions = await timed(video, "captions", () => fetchCaptions(video.youtubeId));
  if (captions.ok) {
    const segments = cleanSegments(captions.segments);
    if (segments.length > 0) return { ok: true, source: captions.source, segments };
    reasons.push({ stage: "captions", message: ONLY_SOUND_LABELS });
  } else {
    reasons.push({ stage: "captions", message: captions.detail });
  }

  if (video.privacyStatus !== "public") {
    reasons.push({ stage: "gemini", message: GEMINI_PUBLIC_ONLY });
    return { ok: false, reasons };
  }

  const gemini = await timed(video, "gemini", () =>
    transcribeWithGemini({ youtubeId: video.youtubeId, durationSeconds: video.durationSeconds }),
  );
  if (gemini.ok) {
    const segments = cleanSegments(gemini.segments);
    if (segments.length > 0) return { ok: true, source: gemini.source, segments };
    reasons.push({ stage: "gemini", message: ONLY_SOUND_LABELS });
  } else {
    console.error(`Transcript ${video.youtubeId}: Gemini failed: ${gemini.detail}`);
    reasons.push({ stage: "gemini", message: gemini.message });
  }
  return { ok: false, reasons };
}

/**
 * Gets a claimed video's transcript and saves it, or marks the video failed
 * with each source's reason. Never throws. Its writes are fenced by
 * `claimedAt`, so a run that was overtaken, by a paste or by a retry after it
 * stalled, changes nothing.
 */
export async function processVideoTranscript(
  video: PipelineVideo,
  claimedAt: Date,
): Promise<void> {
  try {
    const result = await resolveTranscript(video);
    const saved = result.ok
      ? await writeTranscript(
          video.id,
          {
            segments: result.segments,
            text: segmentsToPlainText(result.segments),
            source: result.source,
            timestampsEstimated: false,
          },
          { claimedAt },
        )
      : await markTranscriptFailed(video.id, claimedAt, formatStageReasons(result.reasons));
    if (!saved) {
      console.warn(
        `Transcript ${video.youtubeId}: a paste or a newer run took over, so this result was dropped.`,
      );
    }
  } catch (error) {
    console.error(`Transcript ${video.youtubeId}: processing failed:`, error);
    await markTranscriptFailed(video.id, claimedAt, PROCESSING_CRASHED).catch((markError) =>
      console.error(`Transcript ${video.youtubeId}: couldn't mark it failed:`, markError),
    );
  }
}

/** Runs one stage and logs how it went and how long it took. */
async function timed<T extends { ok: boolean }>(
  video: PipelineVideo,
  stage: StageReason["stage"],
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const result = await run();
  const ms = Math.round(performance.now() - started);
  console.info(`Transcript ${video.youtubeId}: ${stage} ${result.ok ? "succeeded" : "failed"} in ${ms} ms`);
  return result;
}

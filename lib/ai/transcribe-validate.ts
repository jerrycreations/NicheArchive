import { parseTimestamp } from "@/lib/time";
import { durationsFromStarts } from "@/lib/transcript/text";
import type { TranscriptSegment } from "@/lib/transcript/types";

/** A segment as Gemini returns it, before its start time is checked. */
export type GeminiSegment = { start: string; text: string };

/** A segment may start this long after the video ends and still count, since Gemini rounds. */
const END_SLACK_SECONDS = 5;

/** More than this share of unusable start times means the whole result can't be trusted. */
const MAX_DROPPED_SHARE = 0.2;

// Gemini sometimes adds fractions of a second ("1:23.5"); they're dropped.
const FRACTION = /\.\d+$/;

export type GeminiSegmentsResult =
  | { ok: true; segments: TranscriptSegment[] }
  | { ok: false; reason: "no_speech" | "bad_timestamps"; detail: string };

/**
 * Checks Gemini's segments and turns them into transcript segments. Drops
 * segments whose start time is unreadable or past the end of the video, and
 * rejects the result when nothing is left or more than a fifth was dropped.
 * Each duration runs to the next start.
 */
export function validateGeminiSegments(
  raw: readonly GeminiSegment[],
  durationSeconds: number,
): GeminiSegmentsResult {
  const spoken = raw
    .map(({ start, text }) => ({ start: start.trim(), text: text.replace(/\s+/g, " ").trim() }))
    .filter(({ text }) => text);
  if (spoken.length === 0) {
    return { ok: false, reason: "no_speech", detail: "Gemini returned no segments with text." };
  }

  const latest = durationSeconds + END_SLACK_SECONDS;
  const usable: { start: number; text: string }[] = [];
  for (const { start, text } of spoken) {
    const seconds = parseTimestamp(start.replace(FRACTION, ""));
    if (seconds !== null && seconds <= latest) usable.push({ start: seconds, text });
  }

  const dropped = spoken.length - usable.length;
  if (usable.length === 0 || dropped > spoken.length * MAX_DROPPED_SHARE) {
    return {
      ok: false,
      reason: "bad_timestamps",
      detail: `${dropped} of ${spoken.length} segments had a start time that was unreadable or past the end of the video.`,
    };
  }

  // Array.prototype.sort is stable, so segments sharing a start keep their order.
  usable.sort((a, b) => a.start - b.start);
  return { ok: true, segments: durationsFromStarts(usable, durationSeconds) };
}

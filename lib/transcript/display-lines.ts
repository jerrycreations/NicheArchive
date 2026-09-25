import { DISPLAY_LINE_MAX_SECONDS, DISPLAY_LINE_MIN_SECONDS } from "@/lib/constants";
import { endsSentence, pausesBetween } from "@/lib/transcript/text";
import type { TranscriptSegment } from "@/lib/transcript/types";

// Floating-point slack, so a line of exactly ten seconds counts as ten.
const EPSILON = 1e-6;

/** One line of the transcript viewer, with the time its timestamp seeks to. */
export type DisplayLine = { start: number; text: string };

/**
 * Merges caption cues, often only a few words each, into lines of about 10
 * to 20 seconds that are easier to read. A line ends at a sentence end or a
 * pause once it's DISPLAY_LINE_MIN_SECONDS long, and at the next cue once
 * it's DISPLAY_LINE_MAX_SECONDS long. A single longer cue stays one line.
 */
export function groupDisplayLines(segments: readonly TranscriptSegment[]): DisplayLine[] {
  const lines: DisplayLine[] = [];
  let texts: string[] = [];
  let lineStart = 0;
  let previous: TranscriptSegment | undefined;

  for (const segment of segments) {
    if (previous && endsLine(previous, segment, lineStart)) {
      lines.push({ start: lineStart, text: texts.join(" ") });
      texts = [];
    }
    if (texts.length === 0) lineStart = segment.start;
    texts.push(segment.text);
    previous = segment;
  }

  if (texts.length > 0) lines.push({ start: lineStart, text: texts.join(" ") });
  return lines;
}

function endsLine(previous: TranscriptSegment, next: TranscriptSegment, lineStart: number): boolean {
  const length = next.start - lineStart;
  if (length >= DISPLAY_LINE_MAX_SECONDS - EPSILON) return true;
  if (length < DISPLAY_LINE_MIN_SECONDS - EPSILON) return false;
  return endsSentence(previous.text) || pausesBetween(previous, next);
}

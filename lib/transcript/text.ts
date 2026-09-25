import { PARAGRAPH_GAP_SECONDS, PARAGRAPH_MAX_SECONDS } from "@/lib/constants";
import type { TranscriptSegment } from "@/lib/transcript/types";

// Sound labels in square brackets, such as [Music] or [Applause]. In
// parentheses only short ones count, like (laughs): a whole cue in
// parentheses can be an aside someone actually said.
const SOUND_LABEL = /\[[^\]]*\]|\([^()]{0,20}\)/g;

// Anything besides whitespace, punctuation and music notes is speech.
const SPEECH = /[^\s.,!?;:'"“”‘’…\-–—♪♫♬♩#*]/;

// Ends a sentence: . ! ? or …, maybe followed by closing quotes or brackets.
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

// Floating-point slack, so a pause of exactly two seconds counts as two.
const EPSILON = 1e-6;

/** A typical speaking rate, for guessing how long a line takes to say. */
const WORDS_PER_SECOND = 2.5;

/**
 * A caption cue's text with its whitespace collapsed, or null when nothing
 * in it is spoken: only sound labels such as [Music] or (laughs), music
 * notes or punctuation.
 */
export function cleanCueText(text: string): string | null {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return SPEECH.test(collapsed.replace(SOUND_LABEL, "")) ? collapsed : null;
}

/** Drops cues with nothing spoken in them and tidies the rest. Timings stay as they were. */
export function cleanSegments(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  const cleaned: TranscriptSegment[] = [];
  for (const segment of segments) {
    const text = cleanCueText(segment.text);
    if (text !== null) cleaned.push({ ...segment, text });
  }
  return cleaned;
}

/**
 * Groups cues into paragraphs of plain text. A new paragraph starts at a
 * pause of PARAGRAPH_GAP_SECONDS, from the end of one cue to the start of the
 * next, or between their start times when a cue has no duration.
 *
 * Gemini and pasted transcripts have no pauses, because each duration runs
 * to the next start, and overlapping auto-captions rarely do. So a paragraph
 * also ends at the first sentence end after PARAGRAPH_MAX_SECONDS, or at the
 * next cue after twice that when there's no punctuation.
 */
export function segmentsToParagraphs(segments: readonly TranscriptSegment[]): string[] {
  const paragraphs: string[] = [];
  let texts: string[] = [];
  let paragraphStart = 0;
  let previous: TranscriptSegment | undefined;

  for (const segment of segments) {
    if (previous && startsParagraph(previous, segment, paragraphStart)) {
      paragraphs.push(texts.join(" "));
      texts = [];
    }
    if (texts.length === 0) paragraphStart = segment.start;
    texts.push(segment.text);
    previous = segment;
  }

  if (texts.length > 0) paragraphs.push(texts.join(" "));
  return paragraphs;
}

function startsParagraph(
  previous: TranscriptSegment,
  next: TranscriptSegment,
  paragraphStart: number,
): boolean {
  if (pausesBetween(previous, next)) return true;

  const running = next.start - paragraphStart;
  if (running >= PARAGRAPH_MAX_SECONDS && endsSentence(previous.text)) return true;
  return running >= 2 * PARAGRAPH_MAX_SECONDS;
}

/**
 * Whether the speaker pauses for `gapSeconds` (PARAGRAPH_GAP_SECONDS unless
 * given) between two cues: from the end of one to the start of the next, or
 * between their start times when the first has no duration.
 */
export function pausesBetween(
  previous: TranscriptSegment,
  next: TranscriptSegment,
  gapSeconds: number = PARAGRAPH_GAP_SECONDS,
): boolean {
  const previousEnd = previous.start + Math.max(previous.duration, 0);
  return next.start - previousEnd >= gapSeconds - EPSILON;
}

/** Whether `text` ends a sentence, with `.`, `!`, `?` or `…` before any closing quotes or brackets. */
export function endsSentence(text: string): boolean {
  return SENTENCE_END.test(text.trim());
}

/** The transcript as plain text: paragraphs separated by blank lines, with no timestamps. */
export function segmentsToPlainText(segments: readonly TranscriptSegment[]): string {
  return segmentsToParagraphs(segments).join("\n\n");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Roughly how long `text` takes to say, in seconds. */
export function estimateSpeechSeconds(text: string): number {
  return countWords(text) / WORDS_PER_SECOND;
}

/**
 * Gives each segment the time until the next one starts, for sources that
 * only have start times (Gemini, pasted text). The last one gets the time its
 * words take to say, cut off at the end of the video. Expects starts in order.
 */
export function durationsFromStarts(
  timed: readonly { start: number; text: string }[],
  videoSeconds: number,
): TranscriptSegment[] {
  return timed.map(({ start, text }, index) => {
    const next = timed[index + 1];
    let duration: number;
    if (next) {
      duration = next.start - start;
    } else {
      const spoken = estimateSpeechSeconds(text);
      duration = videoSeconds > 0 ? Math.min(spoken, videoSeconds - start) : spoken;
    }
    return { start, duration: Math.max(0, duration), text };
  });
}

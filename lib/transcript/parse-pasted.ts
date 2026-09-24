import { parseTimestamp } from "@/lib/time";
import {
  cleanSegments,
  countWords,
  durationsFromStarts,
  endsSentence,
  estimateSpeechSeconds,
} from "@/lib/transcript/text";
import type { TranscriptSegment } from "@/lib/transcript/types";

/** Pasted text with fewer words than this isn't taken as a transcript. */
const MIN_WORDS = 20;

// Text without timestamps is cut into groups of whole sentences, closed at
// the first sentence end after MIN_GROUP_WORDS, or at MAX_GROUP_WORDS when
// there's no punctuation. That's about 40 words, or 15 seconds of speech.
const MIN_GROUP_WORDS = 25;
const MAX_GROUP_WORDS = 60;

// "[1:23]", "(1:23)" or "1:23" at the start of a line, as m:ss or h:mm:ss.
const LEADING_TIMESTAMP = /^([[(])?(\d{1,3}(?::\d{2}){1,2})([\])])?/;

// Without brackets a timestamp must be followed by a space, a separator or
// the end of the line, so "1:23pm" isn't one.
const AFTER_BARE_TIMESTAMP = /^(?:\s|[-–—|]|:\s|:$)/;

const SEPARATORS = /^[\s:|–—-]+/;

export const NOT_A_TRANSCRIPT =
  "That doesn't look like a transcript. Paste at least a few sentences of it.";

/** For a paste over MAX_PASTED_TRANSCRIPT_CHARS. */
export const TRANSCRIPT_TOO_LONG = "That's too long for one video's transcript.";

export type PastedTranscript =
  | { ok: true; segments: TranscriptSegment[]; timestampsEstimated: boolean }
  | { ok: false; reason: "too_short"; message: string };

/**
 * Turns a transcript the user pasted into segments. Three layouts work:
 * timestamps at the start of lines (`0:00 text`, `[1:23] text`,
 * `(01:02:03) text`), a timestamp on its own line with the text below it (as
 * YouTube's transcript panel copies), and plain text with no timestamps.
 * Plain text gets start times spread across the video, marked as estimated.
 */
export function parsePastedTranscript(text: string, durationSeconds: number): PastedTranscript {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const stamps = lines.map(readTimestamp);
  const stampCount = stamps.filter(Boolean).length;

  // Timestamps must open a fair share of the lines, so prose that happens to
  // start a line with a time ("10:30 is when…") stays plain text.
  const isTimed = stampCount >= 2 && stampCount * 4 >= lines.length;
  const segments = cleanSegments(
    isTimed
      ? durationsFromStarts(timedSegments(lines, stamps), durationSeconds)
      : estimatedSegments(lines.join(" "), durationSeconds),
  );

  const words = segments.reduce((total, segment) => total + countWords(segment.text), 0);
  if (words < MIN_WORDS) {
    return { ok: false, reason: "too_short", message: NOT_A_TRANSCRIPT };
  }
  return { ok: true, segments, timestampsEstimated: !isTimed };
}

type Stamp = { start: number; rest: string };

function readTimestamp(line: string): Stamp | null {
  const match = LEADING_TIMESTAMP.exec(line);
  if (!match) return null;
  const [whole, open, time, close] = match;
  if (Boolean(open) !== Boolean(close)) return null;

  const rest = line.slice(whole.length);
  if (!open && rest && !AFTER_BARE_TIMESTAMP.test(rest)) return null;

  const start = parseTimestamp(time);
  return start === null ? null : { start, rest: rest.replace(SEPARATORS, "") };
}

/**
 * Each timestamp starts a segment holding the rest of its line and the lines
 * below it, up to the next timestamp. Lines before the first timestamp, such
 * as a title, are dropped.
 */
function timedSegments(
  lines: readonly string[],
  stamps: readonly (Stamp | null)[],
): { start: number; text: string }[] {
  const segments: { start: number; parts: string[] }[] = [];
  lines.forEach((line, index) => {
    const stamp = stamps[index];
    if (stamp) {
      segments.push({ start: stamp.start, parts: stamp.rest ? [stamp.rest] : [] });
    } else {
      segments.at(-1)?.parts.push(line);
    }
  });

  return segments
    .map(({ start, parts }) => ({ start, text: parts.join(" ").replace(/\s+/g, " ") }))
    .filter((segment) => segment.text)
    .sort((a, b) => a.start - b.start);
}

/**
 * Cuts untimed text into sentence groups and places each one along the video
 * by how far into the text it starts.
 */
function estimatedSegments(text: string, durationSeconds: number): TranscriptSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const groups: string[][] = [];
  let group: string[] = [];
  for (const word of words) {
    group.push(word);
    if (
      group.length >= MAX_GROUP_WORDS ||
      (group.length >= MIN_GROUP_WORDS && endsSentence(word))
    ) {
      groups.push(group);
      group = [];
    }
  }
  // A short tail joins the group before it rather than standing alone.
  if (group.length > 0) {
    if (group.length < MIN_GROUP_WORDS && groups.length > 0) groups.at(-1)!.push(...group);
    else groups.push(group);
  }

  const span = durationSeconds > 0 ? durationSeconds : estimateSpeechSeconds(text);
  let wordsBefore = 0;
  const timed = groups.map((groupWords) => {
    const start = Math.round((span * wordsBefore * 100) / words.length) / 100;
    wordsBefore += groupWords.length;
    return { start, text: groupWords.join(" ") };
  });
  return durationsFromStarts(timed, durationSeconds);
}

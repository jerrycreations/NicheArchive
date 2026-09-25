import { CHUNK_MAX_SECONDS, CHUNK_TARGET_SECONDS } from "@/lib/constants";
import { endsSentence, pausesBetween } from "@/lib/transcript/text";
import type { TranscriptSegment } from "@/lib/transcript/types";

/** Past the target length, a pause this long between cues ends a chunk. */
const CHUNK_PAUSE_SECONDS = 1.5;

/** A last chunk shorter than this joins the one before it rather than standing alone. */
const MIN_LAST_CHUNK_SECONDS = 15;

// Floating-point slack, so a chunk of exactly a minute counts as a minute.
const EPSILON = 1e-6;

/** A stretch of a transcript that the search index embeds and ranks on its own. Times are in seconds. */
export type TranscriptChunk = {
  position: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

/**
 * Groups consecutive cues into chunks of about CHUNK_TARGET_SECONDS for the
 * search index. Once a chunk reaches the target, it ends at the next sentence
 * end or pause of CHUNK_PAUSE_SECONDS, and it never runs past
 * CHUNK_MAX_SECONDS. A single cue longer than that is first split by words.
 * A short last chunk joins the one before it. Expects cues in order.
 */
export function chunkTranscript(segments: readonly TranscriptSegment[]): TranscriptChunk[] {
  const groups: TranscriptSegment[][] = [];
  let group: TranscriptSegment[] = [];
  let groupEnd = 0;

  for (const piece of segments.flatMap(splitLongCue)) {
    const previous = group.at(-1);
    if (previous && endsChunk(group[0].start, groupEnd, previous, piece)) {
      groups.push(group);
      group = [];
    }
    groupEnd = group.length === 0 ? cueEnd(piece) : Math.max(groupEnd, cueEnd(piece));
    group.push(piece);
  }
  if (group.length > 0) groups.push(group);

  const last = groups.at(-1);
  if (groups.length > 1 && last && spanOf(last) < MIN_LAST_CHUNK_SECONDS - EPSILON) {
    groups.pop();
    groups.at(-1)!.push(...last);
  }

  return groups.map((cues, position) => ({
    position,
    startSeconds: cues[0].start,
    endSeconds: Math.max(...cues.map(cueEnd)),
    text: cues.map((cue) => cue.text).join(" "),
  }));
}

function endsChunk(
  chunkStart: number,
  chunkEnd: number,
  previous: TranscriptSegment,
  next: TranscriptSegment,
): boolean {
  // Taking the next cue would run past the maximum.
  if (cueEnd(next) - chunkStart > CHUNK_MAX_SECONDS + EPSILON) return true;
  if (chunkEnd - chunkStart < CHUNK_TARGET_SECONDS - EPSILON) return false;
  return endsSentence(previous.text) || pausesBetween(previous, next, CHUNK_PAUSE_SECONDS);
}

/**
 * Cuts a cue longer than CHUNK_MAX_SECONDS into pieces of about
 * CHUNK_TARGET_SECONDS by word count, placing each piece by how far into the
 * cue its words start. Drops a cue with no words, so no chunk is empty.
 */
function splitLongCue(cue: TranscriptSegment): TranscriptSegment[] {
  const words = cue.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const text = words.join(" ");
  if (cue.duration <= CHUNK_MAX_SECONDS + EPSILON || words.length === 1) return [{ ...cue, text }];

  const count = Math.min(words.length, Math.ceil(cue.duration / CHUNK_TARGET_SECONDS));
  const timeAt = (wordIndex: number) => cue.start + (cue.duration * wordIndex) / words.length;
  return Array.from({ length: count }, (_, index) => {
    // Each piece gets at least one word, since there are no more pieces than words.
    const from = Math.floor((index * words.length) / count);
    const to = Math.floor(((index + 1) * words.length) / count);
    return {
      start: timeAt(from),
      duration: timeAt(to) - timeAt(from),
      text: words.slice(from, to).join(" "),
    };
  });
}

function cueEnd(cue: TranscriptSegment): number {
  return cue.start + Math.max(cue.duration, 0);
}

function spanOf(cues: readonly TranscriptSegment[]): number {
  return Math.max(...cues.map(cueEnd)) - cues[0].start;
}

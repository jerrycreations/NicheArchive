import type { TranscriptSegment } from "@/lib/transcript/types";

/** A caption cue as caption libraries return it. */
export type RawCaptionCue = {
  offset: number;
  duration: number;
  text: string;
};

export type CueTimeUnit = "seconds" | "milliseconds";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi;

// Captions are sometimes encoded twice (`&amp;#39;`), and libraries decode once.
const MAX_DECODE_PASSES = 3;

// Styling tags some manual captions carry, visible only once entities are decoded.
const FORMATTING_TAG = /<\/?(?:font|b|i|u)\b[^>]*>/gi;

/**
 * Turns library caption cues into transcript segments: converts times to
 * seconds, decodes entities (including double-encoded ones), strips styling
 * tags, collapses whitespace, drops empty or untimed cues and sorts by start.
 */
export function normalizeCaptionCues(
  cues: readonly RawCaptionCue[],
  { unit }: { unit: CueTimeUnit },
): TranscriptSegment[] {
  const divisor = unit === "milliseconds" ? 1000 : 1;
  const segments: TranscriptSegment[] = [];

  for (const cue of cues) {
    const start = cue.offset / divisor;
    if (!Number.isFinite(start) || start < 0) continue;

    const text = decodeEntities(cue.text)
      .replace(FORMATTING_TAG, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    const duration = cue.duration / divisor;
    segments.push({
      start,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      text,
    });
  }

  // Array.prototype.sort is stable, so cues sharing a start keep their order.
  return segments.sort((a, b) => a.start - b.start);
}

function decodeEntities(text: string): string {
  let current = text;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    const next = current.replace(ENTITY, decodeEntity);
    if (next === current) break;
    current = next;
  }
  return current;
}

function decodeEntity(
  match: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string {
  if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
  const codePoint = decimal ? Number(decimal) : parseInt(hex!, 16);
  return codePoint > 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : match;
}

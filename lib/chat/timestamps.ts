import { parseTimestamp } from "@/lib/time";

/** One moment an answer cites. */
export type TimestampCitation = {
  /** Seconds into the video. */
  seconds: number;
  /** The time as written, e.g. `2:15`, or `2:15–2:40` for a range. */
  label: string;
  /** In library answers, the n of `[n @ m:ss]`: which of the supplied videos. */
  source?: number;
};

/** A stretch of answer text, or bracketed citations to link. */
export type CitationPiece =
  | { kind: "text"; text: string }
  | { kind: "citations"; raw: string; citations: TimestampCitation[] };

// Anything in square brackets, on one line; its contents are checked below.
const BRACKETED = /\[([^[\]\n]{1,80})\]/g;

// One citation: `2:15` or `1:02:15`, maybe a range (`2:15-2:40`, `2:15–2:40`),
// maybe with a source number (`2 @ 2:15`).
const CITATION =
  /^(?:(\d{1,2})\s*@\s*)?(\d+:\d{2}(?::\d{2})?)(?:\s*[-–—]\s*(\d+:\d{2}(?::\d{2})?))?$/;

/**
 * Splits answer text into plain text and bracketed timestamp citations:
 * `[2:15]`, `[1:02:15]`, `[2 @ 2:15]`, ranges such as `[2:15–2:40]` (which
 * point at their start) and lists such as `[2:15, 3:40]`. Only bracketed
 * times count, so "10:30 am" stays plain, as does a bracket with anything
 * else in it.
 */
export function parseTimestampCitations(text: string): CitationPiece[] {
  const pieces: CitationPiece[] = [];
  let last = 0;

  for (const match of text.matchAll(BRACKETED)) {
    const citations = parseBracket(match[1]);
    if (!citations) continue;
    if (match.index > last) pieces.push({ kind: "text", text: text.slice(last, match.index) });
    pieces.push({ kind: "citations", raw: match[0], citations });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });
  return pieces;
}

function parseBracket(inner: string): TimestampCitation[] | null {
  const citations: TimestampCitation[] = [];
  for (const item of inner.split(/[,;]/)) {
    const match = CITATION.exec(item.trim());
    if (!match) return null;
    const [, source, start, end] = match;
    const seconds = parseTimestamp(start);
    if (seconds === null || (end !== undefined && parseTimestamp(end) === null)) return null;
    citations.push({
      seconds,
      label: end === undefined ? start : `${start}–${end}`,
      ...(source === undefined ? {} : { source: Number(source) }),
    });
  }
  return citations;
}

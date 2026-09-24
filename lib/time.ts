// The lookaheads reject a bare "P", "PT" or a trailing "T" with nothing after it.
const ISO_DURATION =
  /^P(?=\d|T\d)(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Seconds in an ISO 8601 duration as YouTube returns it (`PT4M7S`,
 * `PT1H2M3S`, `P1DT2H`, or `P0D` for streams). Returns null if malformed.
 */
export function parseIso8601Duration(iso: string): number | null {
  const match = ISO_DURATION.exec(iso.trim());
  if (!match) return null;
  const [days, hours, minutes, seconds] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

function formatClock(totalSeconds: number): string {
  const safe =
    Number.isFinite(totalSeconds) && totalSeconds > 0
      ? Math.floor(totalSeconds)
      : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** A video's length, e.g. `4:07` or `1:02:03`. */
export function formatDuration(seconds: number): string {
  return formatClock(seconds);
}

/** A moment in a video as `m:ss` or `h:mm:ss`. Fractions of a second are dropped. */
export function formatTimestamp(seconds: number): string {
  return formatClock(seconds);
}

const TIMESTAMP = /^(?:(\d+):)?(\d+):(\d{2})$/;

/**
 * Seconds in a `m:ss` or `h:mm:ss` timestamp. Minutes may exceed 59 when
 * there's no hour part (`75:10`). Returns null if malformed.
 */
export function parseTimestamp(text: string): number | null {
  const match = TIMESTAMP.exec(text.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds > 59) return null;
  if (h === undefined) return minutes * 60 + seconds;
  if (m.length > 2 || minutes > 59) return null;
  return Number(h) * 3600 + minutes * 60 + seconds;
}

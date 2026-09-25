const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A calendar date such as "Sep 24, 2026", in `timeZone` or, without one, in
 * the runtime's own zone. Pages show dates through LocalDate, which gives the
 * server a fixed zone and switches to the viewer's in the browser.
 */
export function formatDate(value: Date | string, timeZone?: string): string {
  const key = timeZone ?? "";
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone });
    formatters.set(key, formatter);
  }
  return formatter.format(new Date(value));
}

/** Older than this, a relative time gives way to the date. */
const RELATIVE_DAYS = 7;

/**
 * How long before `now` something happened, in a few characters: "just now",
 * "5m ago", "3h ago", "2d ago". Null from a week back, when a date reads
 * better. Times after `now`, from clock drift, count as just now.
 */
export function formatRelativeTime(value: Date, now: Date): string | null {
  const minutes = Math.floor((now.getTime() - value.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < RELATIVE_DAYS ? `${days}d ago` : null;
}

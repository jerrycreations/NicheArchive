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

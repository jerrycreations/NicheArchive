import { LocalDate } from "@/components/common/local-date";
import { formatRelativeTime } from "@/lib/format/date";

/**
 * A recent time as "5m ago", or the date once it's a week old. `now` comes
 * from the server's render, so the server and the browser show the same text.
 */
export function RelativeTime({ value, now }: { value: Date; now: Date }) {
  const relative = formatRelativeTime(value, now);
  if (!relative) return <LocalDate value={value} />;
  return <time dateTime={value.toISOString()}>{relative}</time>;
}

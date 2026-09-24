"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format/date";

// Nothing to subscribe to: the value only differs between server and browser.
const subscribe = () => () => {};

/**
 * A date in the viewer's time zone. The server can't know that zone, so the
 * server render and hydration use UTC, and the browser re-renders right
 * after. Otherwise a video added on a US evening would show tomorrow's date.
 */
export function LocalDate({ value }: { value: Date }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={value.toISOString()}>
      {formatDate(value, inBrowser ? undefined : "UTC")}
    </time>
  );
}

import { describe, expect, it } from "vitest";
import { formatDate, formatRelativeTime } from "./date";

describe("formatDate", () => {
  it("formats a medium calendar date", () => {
    expect(formatDate(new Date("2026-09-24T12:00:00Z"), "UTC")).toBe("Sep 24, 2026");
  });

  it("puts the same moment on the right day for each time zone", () => {
    // 10:30 pm on September 24 in New York.
    const lateEvening = "2026-09-25T02:30:00Z";
    expect(formatDate(lateEvening, "UTC")).toBe("Sep 25, 2026");
    expect(formatDate(lateEvening, "America/New_York")).toBe("Sep 24, 2026");
    expect(formatDate(lateEvening, "Asia/Tokyo")).toBe("Sep 25, 2026");
  });

  it("accepts ISO strings and Date objects alike", () => {
    const iso = "2025-03-14T15:00:07Z";
    expect(formatDate(iso, "UTC")).toBe("Mar 14, 2025");
    expect(formatDate(new Date(iso), "UTC")).toBe("Mar 14, 2025");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MINUTE = 60_000;

  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [MINUTE, "1m ago"],
    [59 * MINUTE, "59m ago"],
    [60 * MINUTE, "1h ago"],
    [23 * 60 * MINUTE + 59 * MINUTE, "23h ago"],
    [24 * 60 * MINUTE, "1d ago"],
    [6 * 24 * 60 * MINUTE, "6d ago"],
  ])("puts %i ms ago as %j", (ms, text) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(text);
  });

  it("gives way to a date from a week back", () => {
    expect(formatRelativeTime(ago(7 * 24 * 60 * MINUTE), now)).toBeNull();
  });

  it("treats a time just after now as just now", () => {
    expect(formatRelativeTime(ago(-5_000), now)).toBe("just now");
  });
});

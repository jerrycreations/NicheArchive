import { describe, expect, it } from "vitest";
import { formatDate } from "./date";

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

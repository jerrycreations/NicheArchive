import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatTimestamp,
  parseIso8601Duration,
  parseTimestamp,
} from "./time";

describe("parseIso8601Duration", () => {
  it.each([
    ["PT1H2M3S", 3723],
    ["PT4M7S", 247],
    ["PT45S", 45],
    ["PT10M", 600],
    ["PT2H", 7200],
    ["PT1H0M5S", 3605],
    ["P1DT2H", 93600],
    ["P1DT2H3M4S", 93784],
    ["P1D", 86400],
    ["P0D", 0],
    ["PT0S", 0],
  ])("parses %s as %i seconds", (iso, seconds) => {
    expect(parseIso8601Duration(iso)).toBe(seconds);
  });

  it.each(["", "P", "PT", "P1DT", "1H2M", "PT1.5S", "PT5X", "P1Y", "pt1m", "PT-5S", "PT1M2H"])(
    "rejects %j",
    (iso) => {
      expect(parseIso8601Duration(iso)).toBeNull();
    },
  );
});

describe("formatDuration and formatTimestamp", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [60, "1:00"],
    [247, "4:07"],
    [599, "9:59"],
    [600, "10:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3723, "1:02:03"],
    [36000, "10:00:00"],
  ])("formats %i seconds as %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
    expect(formatTimestamp(seconds)).toBe(text);
  });

  it("drops fractions of a second", () => {
    expect(formatTimestamp(95.9)).toBe("1:35");
    expect(formatTimestamp(0.4)).toBe("0:00");
  });

  it("clamps negative and non-finite input to zero", () => {
    expect(formatTimestamp(-5)).toBe("0:00");
    expect(formatTimestamp(Number.NaN)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it.each([
    ["0:00", 0],
    ["0:05", 5],
    ["1:35", 95],
    ["01:35", 95],
    ["59:59", 3599],
    ["75:10", 4510],
    ["1:02:03", 3723],
    ["01:02:03", 3723],
    ["10:00:00", 36000],
    [" 4:07 ", 247],
  ])("parses %j as %i seconds", (text, seconds) => {
    expect(parseTimestamp(text)).toBe(seconds);
  });

  it.each(["", "5", ":30", "1:5", "1:60", "1:60:00", "1:123:00", "1:02:60", "1:02:03:04", "a:bc", "-1:00", "1:00 am"])(
    "rejects %j",
    (text) => {
      expect(parseTimestamp(text)).toBeNull();
    },
  );

  it("reverses formatTimestamp across the hour boundary", () => {
    const samples = [
      0, 1, 9, 10, 59, 60, 61, 599, 600, 601, 3540, 3599, 3600, 3601, 3659,
      3660, 5400, 35999, 36000, 86399, 90061,
    ];
    for (const seconds of samples) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });
});

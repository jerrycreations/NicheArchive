import { describe, expect, it } from "vitest";
import { parseTimestampCitations } from "./timestamps";

describe("parseTimestampCitations", () => {
  it("finds [m:ss] and [h:mm:ss] and keeps the text around them", () => {
    expect(parseTimestampCitations("Yeast eats sugar [0:42], then rests [1:02:03].")).toEqual([
      { kind: "text", text: "Yeast eats sugar " },
      { kind: "citations", raw: "[0:42]", citations: [{ seconds: 42, label: "0:42" }] },
      { kind: "text", text: ", then rests " },
      { kind: "citations", raw: "[1:02:03]", citations: [{ seconds: 3723, label: "1:02:03" }] },
      { kind: "text", text: "." },
    ]);
  });

  it("reads minutes past 59 without an hour", () => {
    expect(parseTimestampCitations("[75:10]")).toEqual([
      { kind: "citations", raw: "[75:10]", citations: [{ seconds: 4510, label: "75:10" }] },
    ]);
  });

  it("finds numbered library citations", () => {
    expect(parseTimestampCitations("Both agree [2 @ 1:23] [10@0:05].")).toEqual([
      { kind: "text", text: "Both agree " },
      { kind: "citations", raw: "[2 @ 1:23]", citations: [{ seconds: 83, label: "1:23", source: 2 }] },
      { kind: "text", text: " " },
      { kind: "citations", raw: "[10@0:05]", citations: [{ seconds: 5, label: "0:05", source: 10 }] },
      { kind: "text", text: "." },
    ]);
  });

  it("points a range at its start", () => {
    expect(parseTimestampCitations("[2:15-2:40] [2:15 – 2:40]")).toEqual([
      { kind: "citations", raw: "[2:15-2:40]", citations: [{ seconds: 135, label: "2:15–2:40" }] },
      { kind: "text", text: " " },
      { kind: "citations", raw: "[2:15 – 2:40]", citations: [{ seconds: 135, label: "2:15–2:40" }] },
    ]);
  });

  it("splits a list of times in one bracket", () => {
    expect(parseTimestampCitations("[0:42, 3:10; 1 @ 4:00]")).toEqual([
      {
        kind: "citations",
        raw: "[0:42, 3:10; 1 @ 4:00]",
        citations: [
          { seconds: 42, label: "0:42" },
          { seconds: 190, label: "3:10" },
          { seconds: 240, label: "4:00", source: 1 },
        ],
      },
    ]);
  });

  it.each([
    ["a bare time", "The class starts at 10:30 am."],
    ["a time with words in the brackets", "See [around 2:15] for more."],
    ["an impossible time", "[2:75]"],
    ["an impossible range end", "[2:15-2:99]"],
    ["a single number", "[2]"],
    ["a list with something else in it", "[2:15, maybe]"],
    ["a markdown checkbox", "- [x] done"],
    ["empty brackets", "[]"],
  ])("leaves %s as plain text", (_, text) => {
    expect(parseTimestampCitations(text)).toEqual([{ kind: "text", text }]);
  });

  it("returns nothing for empty text", () => {
    expect(parseTimestampCitations("")).toEqual([]);
  });
});

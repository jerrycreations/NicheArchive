import { describe, expect, it } from "vitest";
import {
  cleanCueText,
  cleanSegments,
  countWords,
  durationsFromStarts,
  endsSentence,
  estimateSpeechSeconds,
  segmentsToParagraphs,
  segmentsToPlainText,
} from "./text";
import type { TranscriptSegment } from "./types";

const cue = (start: number, duration: number, text: string): TranscriptSegment => ({
  start,
  duration,
  text,
});

/** Cues every 5 seconds whose durations run to the next start, as Gemini's do. */
function continuous(texts: string[]): TranscriptSegment[] {
  return texts.map((text, index) => cue(index * 5, 5, text));
}

describe("cleanCueText", () => {
  it("collapses whitespace", () => {
    expect(cleanCueText("  so the\n dough   rises ")).toBe("so the dough rises");
  });

  it.each([
    "[Music]",
    "[Applause]",
    "  [MUSIC PLAYING]  ",
    "[Music] [Applause]",
    "(laughs)",
    "(audience laughing)",
    "♪♪",
    "♪ ♪",
    "[Music] ♪",
    "...",
    "-",
    "",
  ])("drops %j, which has nothing spoken in it", (text) => {
    expect(cleanCueText(text)).toBeNull();
  });

  it.each([
    "[Music] welcome back",
    "♪ never gonna give you up ♪",
    "what the [ __ ]",
    "(and then he said the part about the bread rising)",
    "42",
  ])("keeps %j", (text) => {
    expect(cleanCueText(text)).toBe(text);
  });
});

describe("cleanSegments", () => {
  it("drops noise cues and keeps the timings of the rest", () => {
    expect(
      cleanSegments([cue(0, 2, "[Music]"), cue(2, 3, " hello  there "), cue(5, 1, "(laughs)")]),
    ).toEqual([cue(2, 3, "hello there")]);
  });
});

describe("segmentsToParagraphs", () => {
  it("starts a paragraph at a pause of two seconds after a cue ends", () => {
    expect(
      segmentsToParagraphs([
        cue(0, 1.5, "one"),
        cue(3.5, 1, "two"), // 2.0 s after "one" ends
        cue(6.4, 1, "three"), // 1.9 s after "two" ends
      ]),
    ).toEqual(["one", "two three"]);
  });

  it("counts a pause of exactly two seconds despite floating-point error", () => {
    // 0.1 + 0.2 is 0.30000000000000004, which leaves a gap just under 2.
    expect(segmentsToParagraphs([cue(0.1, 0.2, "one"), cue(2.3, 1, "two")])).toEqual([
      "one",
      "two",
    ]);
  });

  it("never breaks overlapping cues on the pause rule", () => {
    expect(
      segmentsToParagraphs([cue(0, 4, "one"), cue(2, 4, "two"), cue(4, 4, "three")]),
    ).toEqual(["one two three"]);
  });

  it("uses the gap between start times when a cue has no duration", () => {
    expect(
      segmentsToParagraphs([cue(0, 0, "one"), cue(1.5, 0, "two"), cue(4, 0, "three")]),
    ).toEqual(["one two", "three"]);
  });

  it("ends a paragraph with no pauses at the first sentence end after a minute", () => {
    // Cues start every 5 seconds; only the one at 65 s ends a sentence.
    const texts = Array.from({ length: 16 }, (_, index) =>
      index === 13 ? `line ${index}.` : `line ${index}`,
    );
    const paragraphs = segmentsToParagraphs(continuous(texts));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].endsWith("line 13.")).toBe(true);
    expect(paragraphs[1]).toBe("line 14 line 15");
  });

  it("doesn't break at a sentence end before the paragraph has run a minute", () => {
    const paragraphs = segmentsToParagraphs(continuous(["one.", "two.", "three."]));
    expect(paragraphs).toEqual(["one. two. three."]);
  });

  it("breaks unpunctuated text after two minutes", () => {
    const texts = Array.from({ length: 30 }, (_, index) => `word${index}`);
    const paragraphs = segmentsToParagraphs(continuous(texts));
    // The cue starting at 120 s opens the second paragraph.
    expect(paragraphs.map((paragraph) => paragraph.split(" ").length)).toEqual([24, 6]);
  });

  it("returns nothing for an empty transcript", () => {
    expect(segmentsToParagraphs([])).toEqual([]);
  });
});

describe("segmentsToPlainText", () => {
  it("separates paragraphs with a blank line", () => {
    expect(segmentsToPlainText([cue(0, 1, "one"), cue(5, 1, "two")])).toBe("one\n\ntwo");
  });
});

describe("endsSentence", () => {
  it.each(["Done.", "Really?", "Wow!", "And then…", 'He said "stop."', "(like this.)"])(
    "is true for %j",
    (text) => expect(endsSentence(text)).toBe(true),
  );

  it.each(["and then", "e.g", "1:23"])("is false for %j", (text) =>
    expect(endsSentence(text)).toBe(false),
  );
});

describe("speech timing", () => {
  it("counts words", () => {
    expect(countWords("  one two\nthree ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  it("estimates 2.5 words a second", () => {
    expect(estimateSpeechSeconds("one two three four five six seven eight nine ten")).toBe(4);
  });

  it("runs each duration to the next start and estimates the last", () => {
    expect(
      durationsFromStarts(
        [
          { start: 0, text: "one two" },
          { start: 3, text: "three four five" },
        ],
        100,
      ),
    ).toEqual([cue(0, 3, "one two"), cue(3, 1.2, "three four five")]);
  });

  it("cuts the last duration off at the end of the video", () => {
    expect(durationsFromStarts([{ start: 58, text: "a b c d e f g h i j" }], 60)).toEqual([
      cue(58, 2, "a b c d e f g h i j"),
    ]);
    expect(durationsFromStarts([{ start: 62, text: "late" }], 60)).toEqual([cue(62, 0, "late")]);
  });
});

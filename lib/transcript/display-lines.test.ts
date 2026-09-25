import { describe, expect, it } from "vitest";
import { groupDisplayLines } from "./display-lines";
import type { TranscriptSegment } from "./types";

const cue = (start: number, duration: number, text: string): TranscriptSegment => ({
  start,
  duration,
  text,
});

/** Cues every `step` seconds whose durations run to the next start, with no pauses. */
function continuous(texts: string[], step: number): TranscriptSegment[] {
  return texts.map((text, index) => cue(index * step, step, text));
}

describe("groupDisplayLines", () => {
  it("returns no lines for no cues", () => {
    expect(groupDisplayLines([])).toEqual([]);
  });

  it("starts the first line at the first cue, not at zero", () => {
    expect(groupDisplayLines([cue(3.5, 2, "so"), cue(5.5, 2, "anyway")])).toEqual([
      { start: 3.5, text: "so anyway" },
    ]);
  });

  it("doesn't end a line before 10 seconds, even at a sentence end or a pause", () => {
    const segments = [
      cue(0, 2, "Hello there."),
      cue(3, 2, "How are you?"),
      cue(6, 3, "Fine, thanks."),
    ];
    expect(groupDisplayLines(segments)).toEqual([
      { start: 0, text: "Hello there. How are you? Fine, thanks." },
    ]);
  });

  it("ends a line at the first sentence end after 10 seconds", () => {
    const segments = continuous(["a b", "c d", "e f.", "g h", "i j.", "k l"], 3);
    expect(groupDisplayLines(segments)).toEqual([
      { start: 0, text: "a b c d e f. g h i j." },
      { start: 15, text: "k l" },
    ]);
  });

  it("counts a line of exactly 10 seconds as long enough", () => {
    const segments = [cue(0, 10, "The first sentence."), cue(10, 3, "The second")];
    expect(groupDisplayLines(segments)).toEqual([
      { start: 0, text: "The first sentence." },
      { start: 10, text: "The second" },
    ]);
  });

  it("ends a line at a pause after 10 seconds", () => {
    const segments = [
      cue(0, 1, "one"),
      cue(3, 2, "two"),
      cue(5, 5, "three"),
      cue(10, 1, "four"),
      cue(13, 2, "five"),
    ];
    expect(groupDisplayLines(segments)).toEqual([
      { start: 0, text: "one two three four" },
      { start: 13, text: "five" },
    ]);
  });

  it("ends unpunctuated lines at 20 seconds, as auto-captions need", () => {
    const words = Array.from({ length: 15 }, (_, index) => `w${index}`);
    const lines = groupDisplayLines(continuous(words, 2));
    expect(lines.map((line) => line.start)).toEqual([0, 20]);
    expect(lines[0].text).toBe("w0 w1 w2 w3 w4 w5 w6 w7 w8 w9");
    expect(lines[1].text).toBe("w10 w11 w12 w13 w14");
  });

  it("keeps a cue longer than 20 seconds as a line of its own", () => {
    const segments = [
      cue(0, 12, "Before it."),
      cue(12, 30, "One long pasted paragraph without a break"),
      cue(42, 2, "after it"),
    ];
    expect(groupDisplayLines(segments)).toEqual([
      { start: 0, text: "Before it." },
      { start: 12, text: "One long pasted paragraph without a break" },
      { start: 42, text: "after it" },
    ]);
  });
});

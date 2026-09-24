import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/caption-cues.json";
import { normalizeCaptionCues, type RawCaptionCue } from "./caption-normalize";

const cue = (text: string, offset = 0, duration = 1): RawCaptionCue => ({
  text,
  offset,
  duration,
});

const textOf = (text: string) =>
  normalizeCaptionCues([cue(text)], { unit: "seconds" }).map((s) => s.text);

describe("normalizeCaptionCues", () => {
  it("normalizes sample library output", () => {
    expect(normalizeCaptionCues(fixture, { unit: "seconds" })).toEqual([
      { start: 0, duration: 3.04, text: "[Music]" },
      { start: 3.12, duration: 4.8, text: "welcome back everybody today we're" },
      { start: 7.92, duration: 3.36, text: "looking at how the engine actually starts" },
      { start: 11.28, duration: 3.2, text: "first the fuel pump & filter" },
      { start: 14.56, duration: 2.64, text: "it\u2019s simpler than you'd think" },
      { start: 17.2, duration: 1.1, text: '"click"' },
    ]);
  });

  describe("time units", () => {
    it("keeps seconds as they are", () => {
      expect(
        normalizeCaptionCues([cue("hi", 1.5, 2.25)], { unit: "seconds" }),
      ).toEqual([{ start: 1.5, duration: 2.25, text: "hi" }]);
    });

    it("converts milliseconds to seconds", () => {
      expect(
        normalizeCaptionCues([cue("hi", 1500, 2250)], { unit: "milliseconds" }),
      ).toEqual([{ start: 1.5, duration: 2.25, text: "hi" }]);
    });
  });

  describe("entities", () => {
    it.each([
      ["Tom &amp; Jerry", "Tom & Jerry"],
      ["&lt;3 &gt; &quot;quoted&quot; &apos;single&apos;", `<3 > "quoted" 'single'`],
      ["don&#39;t", "don't"],
      ["it&#8217;s", "it\u2019s"],
      ["caf&#xE9; &#X2014; done", "caf\u00e9 \u2014 done"],
      ["a&nbsp;b", "a b"],
      ["AT&AMP;T", "AT&T"],
    ])("decodes %j", (input, expected) => {
      expect(textOf(input)).toEqual([expected]);
    });

    it.each([
      ["you&amp;#39;d", "you'd"],
      ["R&amp;amp;D", "R&D"],
      ["&amp;quot;hi&amp;quot;", '"hi"'],
    ])("decodes double-encoded %j", (input, expected) => {
      expect(textOf(input)).toEqual([expected]);
    });

    it.each(["&copy; stays", "&#0; stays", "&#x110000; stays", "fish & chips"])(
      "leaves unknown or invalid entities alone in %j",
      (input) => {
        expect(textOf(input)).toEqual([input]);
      },
    );
  });

  describe("formatting tags", () => {
    it("strips styling tags, including encoded ones", () => {
      expect(textOf('<font color="#E5E5E5">bold</font> <b>move</b>')).toEqual([
        "bold move",
      ]);
      expect(textOf("&lt;i&gt;whispers&lt;/i&gt; quietly")).toEqual([
        "whispers quietly",
      ]);
    });

    it("keeps other angle brackets", () => {
      expect(textOf("x < y and <bold> <under>")).toEqual(["x < y and <bold> <under>"]);
    });
  });

  it("collapses whitespace, newlines and non-breaking spaces", () => {
    expect(textOf("  one\n two\t\tthree\u00a0 four  ")).toEqual([
      "one two three four",
    ]);
  });

  it("drops empty cues, including ones that are empty after cleanup", () => {
    const result = normalizeCaptionCues(
      [cue(""), cue("   "), cue("\n"), cue("<font></font>"), cue("&nbsp;"), cue("kept")],
      { unit: "seconds" },
    );
    expect(result.map((s) => s.text)).toEqual(["kept"]);
  });

  it("drops cues without a usable start and zeroes bad durations", () => {
    const result = normalizeCaptionCues(
      [
        cue("negative start", -1),
        cue("no start", Number.NaN),
        cue("infinite start", Number.POSITIVE_INFINITY),
        cue("negative duration", 1, -2),
        cue("no duration", 2, Number.NaN),
      ],
      { unit: "seconds" },
    );
    expect(result).toEqual([
      { start: 1, duration: 0, text: "negative duration" },
      { start: 2, duration: 0, text: "no duration" },
    ]);
  });

  it("sorts by start and keeps the original order for equal starts", () => {
    const result = normalizeCaptionCues(
      [cue("c", 5), cue("a", 1), cue("b1", 3), cue("b2", 3), cue("b3", 3)],
      { unit: "seconds" },
    );
    expect(result.map((s) => s.text)).toEqual(["a", "b1", "b2", "b3", "c"]);
  });

  it("does not modify its input", () => {
    const input = [cue("b &amp; c", 2), cue("a", 1)];
    const copy = structuredClone(input);
    normalizeCaptionCues(input, { unit: "milliseconds" });
    expect(input).toEqual(copy);
  });
});

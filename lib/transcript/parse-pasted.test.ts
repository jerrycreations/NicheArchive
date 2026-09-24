import { describe, expect, it } from "vitest";
import { NOT_A_TRANSCRIPT, parsePastedTranscript } from "./parse-pasted";

const SENTENCE = "The dough rises because yeast turns sugar into gas.";

function expectOk(result: ReturnType<typeof parsePastedTranscript>) {
  if (!result.ok) throw new Error(`Expected a transcript, got ${result.reason}`);
  return result;
}

describe("parsePastedTranscript: timestamps at the start of lines", () => {
  it("reads m:ss timestamps and runs each duration to the next start", () => {
    const result = expectOk(
      parsePastedTranscript(
        [
          "0:00 Welcome back to the kitchen, everyone.",
          "0:04 Today we're looking at how bread rises in the oven.",
          "0:09 It all starts with yeast and a little sugar and some patience.",
        ].join("\n"),
        60,
      ),
    );
    expect(result.timestampsEstimated).toBe(false);
    expect(result.segments.map(({ start, duration }) => [start, duration])).toEqual([
      [0, 4],
      [4, 5],
      [9, 12 / 2.5],
    ]);
    expect(result.segments[1].text).toBe("Today we're looking at how bread rises in the oven.");
  });

  it("reads bracketed, parenthesized and h:mm:ss timestamps with separators", () => {
    const result = expectOk(
      parsePastedTranscript(
        [
          `[0:05] ${SENTENCE}`,
          `(01:02:03) - ${SENTENCE}`,
          `1:02:10: ${SENTENCE}`,
          `[2:00]${SENTENCE}`,
        ].join("\n"),
        4000,
      ),
    );
    expect(result.segments.map((segment) => segment.start)).toEqual([5, 120, 3723, 3730]);
    expect(result.segments.every((segment) => segment.text === SENTENCE)).toBe(true);
  });

  it("sorts timestamps that arrive out of order", () => {
    const result = expectOk(
      parsePastedTranscript(`0:10 ${SENTENCE}\n0:00 ${SENTENCE}\n0:20 ${SENTENCE}`, 60),
    );
    expect(result.segments.map((segment) => segment.start)).toEqual([0, 10, 20]);
  });

  it("drops lines before the first timestamp, such as a title", () => {
    const result = expectOk(
      parsePastedTranscript(
        `How Bread Rises\nTranscript\n0:00 ${SENTENCE}\n0:05 ${SENTENCE}\n0:10 ${SENTENCE}`,
        60,
      ),
    );
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].text).toBe(SENTENCE);
  });

  it("drops cues that are only sound labels", () => {
    const result = expectOk(
      parsePastedTranscript(
        `0:00 [Music]\n0:03 ${SENTENCE}\n0:08 ${SENTENCE}\n0:13 ${SENTENCE}`,
        60,
      ),
    );
    expect(result.segments.map((segment) => segment.start)).toEqual([3, 8, 13]);
  });
});

describe("parsePastedTranscript: a timestamp on its own line", () => {
  it("takes the text from the lines below each timestamp", () => {
    const result = expectOk(
      parsePastedTranscript(
        [
          "0:00",
          "welcome back to the kitchen everyone",
          "0:03",
          "today we're looking at how bread rises",
          "and why it needs time",
          "1:02:03",
          "that's all for today thanks for watching",
        ].join("\n"),
        4000,
      ),
    );
    expect(result.timestampsEstimated).toBe(false);
    expect(result.segments.map(({ start, text }) => [start, text])).toEqual([
      [0, "welcome back to the kitchen everyone"],
      [3, "today we're looking at how bread rises and why it needs time"],
      [3723, "that's all for today thanks for watching"],
    ]);
  });
});

describe("parsePastedTranscript: no timestamps", () => {
  it("spreads sentence groups across the video and marks the times as estimated", () => {
    const text = Array.from({ length: 12 }, () => SENTENCE).join(" "); // 9 words each
    const result = expectOk(parsePastedTranscript(text, 300));
    expect(result.timestampsEstimated).toBe(true);

    // Groups close at the first sentence end after 25 words: 27 words each.
    expect(result.segments.map((segment) => segment.text.split(" ").length)).toEqual([
      27, 27, 27, 27,
    ]);
    expect(result.segments.map((segment) => segment.start)).toEqual([0, 75, 150, 225]);
    expect(result.segments[3].duration).toBeCloseTo(27 / 2.5);
  });

  it("joins lines and cuts unpunctuated text every 60 words", () => {
    const words = Array.from({ length: 130 }, (_, index) => `word${index}`);
    const text = [words.slice(0, 70).join(" "), words.slice(70).join(" ")].join("\n");
    const result = expectOk(parsePastedTranscript(text, 130));
    // The last 10 words are too few to stand alone, so they join the group before.
    expect(result.segments.map((segment) => segment.text.split(" ").length)).toEqual([60, 70]);
    expect(result.segments.map((segment) => segment.start)).toEqual([0, 60]);
  });

  it("keeps prose that happens to start a line with a time as plain text", () => {
    const text = `10:30 is when the dough goes in. ${SENTENCE}\n${SENTENCE}\n${SENTENCE}`;
    const result = expectOk(parsePastedTranscript(text, 120));
    expect(result.timestampsEstimated).toBe(true);
    expect(result.segments[0].text.startsWith("10:30 is when")).toBe(true);
  });

  it("doesn't treat 1:23pm as a timestamp", () => {
    const text = `1:23pm ${SENTENCE}\n1:45pm ${SENTENCE}\n${SENTENCE}`;
    expect(expectOk(parsePastedTranscript(text, 120)).timestampsEstimated).toBe(true);
  });

  it("estimates from the text's length when the video's length is unknown", () => {
    const text = Array.from({ length: 6 }, () => SENTENCE).join(" "); // 54 words, 21.6 s
    const result = expectOk(parsePastedTranscript(text, 0));
    expect(result.segments.map((segment) => segment.start)).toEqual([0, 10.8]);
    expect(result.segments[1].duration).toBeCloseTo(27 / 2.5);
  });
});

describe("parsePastedTranscript: rejection", () => {
  it.each([
    ["an empty paste", "   \n  "],
    ["a few words", "Thanks for watching, see you next time!"],
    ["only sound labels", "0:00 [Music]\n0:05 [Applause]\n0:10 [Music]"],
    ["19 words", Array.from({ length: 19 }, () => "word").join(" ")],
  ])("rejects %s", (_, text) => {
    expect(parsePastedTranscript(text, 120)).toEqual({
      ok: false,
      reason: "too_short",
      message: NOT_A_TRANSCRIPT,
    });
  });

  it("accepts 20 words", () => {
    const text = Array.from({ length: 20 }, () => "word").join(" ");
    expect(parsePastedTranscript(text, 120).ok).toBe(true);
  });
});

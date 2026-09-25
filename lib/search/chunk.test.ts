import { describe, expect, it } from "vitest";
import { parsePastedTranscript } from "@/lib/transcript/parse-pasted";
import type { TranscriptSegment } from "@/lib/transcript/types";
import { chunkTranscript } from "./chunk";

const cue = (start: number, duration: number, text: string): TranscriptSegment => ({
  start,
  duration,
  text,
});

/**
 * Cues every `step` seconds whose durations run to the next start, like
 * Gemini's and pasted transcripts. `text(i)` gives each cue's words.
 */
function continuous(count: number, step: number, text: (index: number) => string): TranscriptSegment[] {
  return Array.from({ length: count }, (_, index) => cue(index * step, step, text(index)));
}

const spans = (segments: TranscriptSegment[]) =>
  chunkTranscript(segments).map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]);

describe("chunkTranscript", () => {
  it("returns no chunks for no cues", () => {
    expect(chunkTranscript([])).toEqual([]);
  });

  it("keeps a short transcript as one chunk from its first cue to its last cue's end", () => {
    const segments = [cue(1.5, 2, "Hi."), cue(4, 3, "This is short."), cue(8, 2.5, "Bye.")];
    expect(chunkTranscript(segments)).toEqual([
      { position: 0, startSeconds: 1.5, endSeconds: 10.5, text: "Hi. This is short. Bye." },
    ]);
  });

  it("ends a chunk at the first sentence end once it reaches the target of a minute", () => {
    const segments = continuous(24, 5, (index) => `sentence ${index}.`);
    expect(spans(segments)).toEqual([
      [0, 60],
      [60, 120],
    ]);
  });

  it("doesn't end a chunk at a sentence end or pause before the target", () => {
    const segments = [
      ...continuous(6, 5, (index) => (index === 5 ? "early end." : "words")), // 0 to 30
      // After a 5-second pause.
      ...continuous(6, 5, () => "words").map((later) => ({ ...later, start: later.start + 35 })),
    ];
    expect(spans(segments)).toEqual([[0, 65]]);
  });

  it("past the target, waits for the next sentence end", () => {
    const segments = continuous(24, 5, (index) => (index === 14 ? "the end." : "words"));
    expect(spans(segments)).toEqual([
      [0, 75],
      [75, 120],
    ]);
  });

  it("past the target, ends at a pause of 1.5 seconds but not a shorter one", () => {
    const segments = [
      ...continuous(13, 5, () => "no punctuation"), // 0 to 65
      cue(66, 4, "after one second"), // 1-second gap: not a break
      cue(71.5, 4, "after one and a half"), // 1.5-second gap from 70: a break
      ...continuous(6, 5, () => "more").map((later) => ({ ...later, start: later.start + 75.5 })),
    ];
    expect(spans(segments)).toEqual([
      [0, 70],
      [71.5, 105.5],
    ]);
  });

  it("cuts a chunk with no sentence end or pause at 90 seconds", () => {
    const segments = continuous(40, 5, () => "no punctuation at all");
    expect(spans(segments)).toEqual([
      [0, 90],
      [90, 180],
      [180, 200],
    ]);
  });

  it("splits a cue longer than 90 seconds by words, with interpolated times", () => {
    const words = Array.from({ length: 40 }, (_, index) => `w${index}`);
    const chunks = chunkTranscript([cue(10, 200, words.join(" "))]);

    expect(chunks.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds])).toEqual([
      [10, 60],
      [60, 110],
      [110, 160],
      [160, 210],
    ]);
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      words.slice(0, 10).join(" "),
      words.slice(10, 20).join(" "),
      words.slice(20, 30).join(" "),
      words.slice(30, 40).join(" "),
    ]);
  });

  it("keeps a long cue of a single word whole", () => {
    expect(spans([cue(0, 120, "Music")])).toEqual([[0, 120]]);
  });

  it("merges a last chunk shorter than 15 seconds into the one before it", () => {
    const segments = continuous(14, 5, (index) => `sentence ${index}.`); // 70 seconds
    expect(chunkTranscript(segments)).toEqual([
      expect.objectContaining({ position: 0, startSeconds: 0, endSeconds: 70 }),
    ]);
  });

  it("keeps a last chunk of 15 seconds or more on its own", () => {
    const segments = continuous(15, 5, (index) => `sentence ${index}.`); // 75 seconds
    expect(spans(segments)).toEqual([
      [0, 60],
      [60, 75],
    ]);
  });

  it("numbers chunks in order and keeps every word exactly once", () => {
    const segments = continuous(100, 3, (index) => `word${index} more${index}.`);
    const chunks = chunkTranscript(segments);

    expect(chunks.map((chunk) => chunk.position)).toEqual(chunks.map((_, index) => index));
    expect(chunks.map((chunk) => chunk.text).join(" ")).toBe(
      segments.map((segment) => segment.text).join(" "),
    );
  });

  it("uses the latest end among overlapping auto-captions", () => {
    const segments = [cue(0, 6, "one"), cue(2, 8, "two"), cue(4, 3, "three")];
    expect(spans(segments)).toEqual([[0, 10]]);
  });

  it("never returns an empty chunk", () => {
    expect(chunkTranscript([cue(0, 5, "  "), cue(5, 5, "")])).toEqual([]);
    expect(chunkTranscript([cue(0, 5, " "), cue(5, 5, "Hello  there.")])).toEqual([
      { position: 0, startSeconds: 5, endSeconds: 10, text: "Hello there." },
    ]);
  });

  it("chunks pasted text with estimated timestamps into chunks of about a minute", () => {
    // About 1,000 words over ten minutes, in sentences of eight words.
    const sentences = Array.from(
      { length: 125 },
      (_, index) => `This is sentence number ${index} of the pasted text.`,
    );
    const pasted = parsePastedTranscript(sentences.join(" "), 600);
    if (!pasted.ok) throw new Error(pasted.message);
    expect(pasted.timestampsEstimated).toBe(true);

    const chunks = chunkTranscript(pasted.segments);
    expect(chunks.length).toBeGreaterThanOrEqual(7);
    expect(chunks.length).toBeLessThanOrEqual(10);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endSeconds - chunk.startSeconds).toBeGreaterThanOrEqual(60);
      expect(chunk.endSeconds - chunk.startSeconds).toBeLessThanOrEqual(90);
    }
    // The last estimate ends when its words would, just short of the video's end.
    expect(chunks.at(-1)!.endSeconds).toBeGreaterThan(590);
    expect(chunks.at(-1)!.endSeconds).toBeLessThanOrEqual(600);
    expect(chunks.map((chunk) => chunk.text).join(" ")).toBe(sentences.join(" "));
  });

  it("splits pasted text spread thinly over a long video", () => {
    // 85 unpunctuated words across ten minutes: the first 60 become one
    // estimated cue lasting about seven minutes.
    const words = Array.from({ length: 85 }, (_, index) => `word${index}`);
    const pasted = parsePastedTranscript(words.join(" "), 600);
    if (!pasted.ok) throw new Error(pasted.message);
    expect(pasted.segments[0].duration).toBeGreaterThan(400);

    const chunks = chunkTranscript(pasted.segments);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.endSeconds - chunk.startSeconds).toBeLessThanOrEqual(90);
      expect(chunk.text).not.toBe("");
    }
  });
});

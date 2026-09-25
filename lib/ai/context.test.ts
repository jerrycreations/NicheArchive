import { describe, expect, it } from "vitest";
import { generalSystemPrompt, videoSystemPrompt } from "@/lib/ai/prompts/chat";
import type { MessageRole } from "@/lib/chat/types";
import type { TranscriptSegment } from "@/lib/transcript/types";
import { formatTranscriptForPrompt, toModelMessages, trimHistory } from "./context";

const cue = (start: number, text: string, duration = 3): TranscriptSegment => ({
  start,
  duration,
  text,
});

describe("formatTranscriptForPrompt", () => {
  it("merges cues into lines of about 15 seconds, each with its start time", () => {
    const segments = [
      cue(0, "Welcome back."),
      cue(4, "Today we bake bread."),
      cue(9.5, "First, the flour."),
      cue(15, "Then the water."),
      cue(22, "Mix it well."),
      cue(31, "Now we wait."),
    ];
    expect(formatTranscriptForPrompt(segments)).toBe(
      [
        "[0:00] Welcome back. Today we bake bread. First, the flour.",
        "[0:15] Then the water. Mix it well.",
        "[0:31] Now we wait.",
      ].join("\n"),
    );
  });

  it("drops fractions of a second and writes hours past the first", () => {
    expect(formatTranscriptForPrompt([cue(65.8, "a"), cue(3725.2, "b")])).toBe(
      "[1:05] a\n[1:02:05] b",
    );
  });

  it("collapses whitespace and skips empty cues", () => {
    expect(formatTranscriptForPrompt([cue(0, "  so \n the"), cue(2, "   "), cue(3, "dough")])).toBe(
      "[0:00] so the dough",
    );
  });

  it("returns nothing for an empty transcript", () => {
    expect(formatTranscriptForPrompt([])).toBe("");
  });
});

type Row = { role: MessageRole; content: string };
const ask = (content: string): Row => ({ role: "user", content });
const answer = (content: string): Row => ({ role: "assistant", content });

describe("trimHistory", () => {
  const history = [ask("q1"), answer("a1"), ask("q2"), answer("a2"), ask("q3"), answer("a3")];

  it("keeps a short history whole", () => {
    expect(trimHistory(history, 20)).toEqual(history);
  });

  it("keeps the most recent messages", () => {
    expect(trimHistory(history, 4)).toEqual([ask("q2"), answer("a2"), ask("q3"), answer("a3")]);
  });

  it("drops an answer left at the start without its question", () => {
    expect(trimHistory(history, 5)).toEqual([ask("q2"), answer("a2"), ask("q3"), answer("a3")]);
  });

  it("returns nothing when no question is left", () => {
    expect(trimHistory([answer("a1")], 20)).toEqual([]);
    expect(trimHistory(history, 1)).toEqual([]);
  });

  it("returns nothing for a limit of zero", () => {
    expect(trimHistory(history, 0)).toEqual([]);
  });
});

describe("toModelMessages", () => {
  it("turns saved rows into model messages, extra columns left behind", () => {
    const rows = [
      { ...ask("What's proofing?"), id: "m1", sources: null },
      { ...answer("Letting dough rise [1:05]."), id: "m2", sources: null },
    ];
    expect(toModelMessages(rows)).toEqual([
      { role: "user", content: "What's proofing?" },
      { role: "assistant", content: "Letting dough rise [1:05]." },
    ]);
  });
});

describe("videoSystemPrompt", () => {
  const video = {
    title: "How Bread Rises",
    channel: "The Kitchen Lab",
    durationSeconds: 247,
    segments: [cue(0, "Welcome back."), cue(20, "Yeast eats sugar.")],
    timestampsEstimated: false,
  };

  it("names the video and includes the timestamped transcript and the citation rule", () => {
    const prompt = videoSystemPrompt(video);
    expect(prompt).toContain('Video: "How Bread Rises" by The Kitchen Lab, 4:07 long.');
    expect(prompt).toContain("<transcript>\n[0:00] Welcome back.\n[0:20] Yeast eats sugar.\n</transcript>");
    expect(prompt).toContain("like [2:15]");
    expect(prompt).toContain("general knowledge");
    expect(prompt).not.toContain("estimates");
  });

  it("says when the timestamps are estimates", () => {
    expect(videoSystemPrompt({ ...video, timestampsEstimated: true })).toContain(
      'approximate, like "around [2:15]"',
    );
  });
});

describe("generalSystemPrompt", () => {
  it("says there are no transcripts", () => {
    expect(generalSystemPrompt()).toContain("no transcripts attached");
  });
});

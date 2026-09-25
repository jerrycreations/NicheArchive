import { describe, expect, it } from "vitest";
import { generalSystemPrompt, videoSystemPrompt } from "@/lib/ai/prompts/chat";
import type { MessageRole } from "@/lib/chat/types";
import type { TranscriptSegment } from "@/lib/transcript/types";
import {
  buildLibraryContext,
  formatTranscriptForPrompt,
  toModelMessages,
  trimHistory,
  type LibraryContextVideo,
} from "./context";

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

describe("buildLibraryContext", () => {
  /** One cue every 20 seconds for `minutes` minutes, each saying where it is. */
  function transcript(minutes: number, words = "and so on"): TranscriptSegment[] {
    return Array.from({ length: minutes * 3 }, (_, index) =>
      cue(index * 20, `Line ${index} ${words}.`, 20),
    );
  }

  function video(
    index: number,
    fields: Partial<LibraryContextVideo> = {},
  ): LibraryContextVideo {
    return {
      index,
      title: `Video title ${index}`,
      channel: `Channel ${index}`,
      durationSeconds: 600,
      segments: transcript(10),
      timestampsEstimated: false,
      matches: [{ startSeconds: 120, endSeconds: 180 }],
      ...fields,
    };
  }

  it("numbers each video with its title, channel, length and full transcript", () => {
    const context = buildLibraryContext([
      video(1, { segments: [cue(0, "Yeast eats sugar."), cue(20, "It makes gas.")], durationSeconds: 247 }),
      video(2, { segments: [cue(65, "Knead for ten minutes.")] }),
    ]);
    expect(context).toBe(
      [
        '<video number="1">',
        "Title: Video title 1",
        "Channel: Channel 1",
        "Length: 4:07",
        "[0:00] Yeast eats sugar.",
        "[0:20] It makes gas.",
        "</video>",
        "",
        '<video number="2">',
        "Title: Video title 2",
        "Channel: Channel 2",
        "Length: 10:00",
        "[1:05] Knead for ten minutes.",
        "</video>",
      ].join("\n"),
    );
  });

  it("notes estimated timestamps", () => {
    expect(buildLibraryContext([video(1, { timestampsEstimated: true })])).toContain(
      "Note: timestamps are estimates",
    );
  });

  it("keeps whole transcripts that fit the budget", () => {
    const context = buildLibraryContext([video(1), video(2)], 100_000);
    expect(context).not.toContain("excerpts");
    expect(context).toContain("[9:40] Line 29");
  });

  it("cuts the largest transcript to three minutes either side of its matches", () => {
    const long = video(1, {
      segments: transcript(60, "with plenty of words to make it long"),
      durationSeconds: 3600,
      matches: [
        { startSeconds: 600, endSeconds: 660 },
        { startSeconds: 2400, endSeconds: 2460 },
      ],
    });
    const short = video(2);
    const full = buildLibraryContext([long, short], Infinity);
    const context = buildLibraryContext([long, short], full.length - 1);

    const [first, second] = context.split("\n\n");
    expect(first).toContain("Note: only excerpts");
    // 7:00 to 14:00 around the first match, 37:00 to 44:00 around the second.
    expect(first).not.toContain("[6:40]");
    expect(first).toContain("[7:00] Line 21");
    expect(first).toContain("[13:40] Line 41");
    expect(first).not.toContain("[14:00]");
    expect(first).toContain("[13:40] Line 41 with plenty of words to make it long.\n[…]\n[37:00] Line 111");
    expect(first).toContain("[43:40] Line 131");
    expect(first).not.toContain("[44:00]");
    // The smaller transcript stays whole.
    expect(second).not.toContain("excerpts");
    expect(second).toContain("[0:00] Line 0");
    expect(context.length).toBeLessThan(full.length);
  });

  it("merges overlapping excerpt windows", () => {
    const context = buildLibraryContext(
      [
        video(1, {
          segments: transcript(30),
          matches: [
            { startSeconds: 300, endSeconds: 360 },
            { startSeconds: 420, endSeconds: 480 },
          ],
        }),
      ],
      1_000,
    );
    // 2:00 to 11:00 in one window, with no gap marked.
    expect(context).toContain("[2:00] Line 6");
    expect(context).toContain("[10:40] Line 32");
    expect(context).not.toContain("[…]\n");
  });

  it("cuts only as many transcripts as it needs to, largest first", () => {
    const videos = [video(1, { segments: transcript(20) }), video(2, { segments: transcript(40) })];
    const full = buildLibraryContext(videos, Infinity);
    const [first, second] = buildLibraryContext(videos, full.length - 10).split("\n\n");
    expect(first).not.toContain("excerpts");
    expect(second).toContain("Note: only excerpts");
  });

  it("cuts the largest short at a line when even excerpts don't fit", () => {
    const context = buildLibraryContext([video(1, { segments: transcript(30) })], 400);
    expect(context).toContain("Note: cut short to fit.");
    expect(context.length).toBeLessThanOrEqual(400);
    expect(context.endsWith(".\n</video>")).toBe(true);
  });
});

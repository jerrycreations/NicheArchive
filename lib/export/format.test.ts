import { describe, expect, it } from "vitest";
import type { TranscriptSegment } from "@/lib/transcript/types";
import { formatTranscriptFile, type ExportVideo } from "./format";

const cue = (start: number, duration: number, text: string): TranscriptSegment => ({
  start,
  duration,
  text,
});

const video = (overrides: Partial<ExportVideo> = {}): ExportVideo => ({
  youtubeId: "abc123xyz00",
  title: "How Bread Rises",
  channel: "The Kitchen Lab",
  publishedAt: new Date("2025-03-14T12:00:00Z"),
  transcriptSegments: [
    cue(0, 2, "Yeast eats sugar."),
    cue(2, 2, "It makes gas."),
    // A pause of 3 seconds starts a new paragraph.
    cue(7, 2, "The gas gets trapped."),
  ],
  ...overrides,
});

describe("formatTranscriptFile", () => {
  it("writes the header, a blank line and the paragraphs, ending with a newline", () => {
    expect(formatTranscriptFile(video())).toBe(
      [
        "Title: How Bread Rises",
        "Channel: The Kitchen Lab",
        "URL: https://www.youtube.com/watch?v=abc123xyz00",
        "Published: 2025-03-14",
        "",
        "Yeast eats sugar. It makes gas.",
        "",
        "The gas gets trapped.",
        "",
      ].join("\n"),
    );
  });

  it("dates the video in UTC", () => {
    // 11:30 pm in New York is already the next day in UTC.
    const text = formatTranscriptFile(video({ publishedAt: new Date("2025-03-14T23:30:00-05:00") }));
    expect(text).toContain("Published: 2025-03-15\n");
  });

  it("keeps each header field on one line", () => {
    const text = formatTranscriptFile(video({ title: "Bread\nPart  2", channel: " Lab\t" }));
    expect(text.split("\n").slice(0, 2)).toEqual(["Title: Bread Part 2", "Channel: Lab"]);
  });

  it("writes only the header for an empty transcript", () => {
    const text = formatTranscriptFile(video({ transcriptSegments: [] }));
    expect(text.endsWith("Published: 2025-03-14\n")).toBe(true);
  });
});

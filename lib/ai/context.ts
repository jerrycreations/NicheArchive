// Pure builders for what a chat sends to Gemini: transcripts as prompt text,
// and the conversation so far as model messages.
import type { ModelMessage } from "ai";
import type { MessageRole } from "@/lib/chat/types";
import { MAX_LIBRARY_CONTEXT_CHARS, PROMPT_LINE_SECONDS } from "@/lib/constants";
import { formatDuration, formatTimestamp } from "@/lib/time";
import type { TranscriptSegment } from "@/lib/transcript/types";

/** An excerpt keeps this much of the transcript either side of each match. */
const EXCERPT_PADDING_SECONDS = 180;

/**
 * A transcript as prompt text: one line per PROMPT_LINE_SECONDS or so, each
 * starting with the time it's spoken, as in `[1:05] text`. These are the
 * timestamps Gemini cites back.
 */
export function formatTranscriptForPrompt(segments: readonly TranscriptSegment[]): string {
  const lines: string[] = [];
  let lineStart = 0;
  let texts: string[] = [];

  const flush = () => {
    if (texts.length > 0) lines.push(`[${formatTimestamp(lineStart)}] ${texts.join(" ")}`);
    texts = [];
  };

  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (texts.length > 0 && segment.start - lineStart >= PROMPT_LINE_SECONDS) flush();
    if (texts.length === 0) lineStart = segment.start;
    texts.push(text);
  }
  flush();
  return lines.join("\n");
}

/** A video sent with a library question, numbered as its [n @ m:ss] citations are. */
export type LibraryContextVideo = {
  index: number;
  title: string;
  channel: string;
  durationSeconds: number;
  segments: readonly TranscriptSegment[];
  /** Pasted text had no timestamps, so they were spread evenly over the video. */
  timestampsEstimated: boolean;
  /** The stretches that matched the question, which an excerpt keeps. */
  matches: readonly { startSeconds: number; endSeconds: number }[];
};

/**
 * The transcripts sent with a library question, each under its number
 * (`<video number="1">`), title and channel. When they come to more than
 * `maxChars`, the largest are cut, one by one, to excerpts: the lines within
 * three minutes of their matches, marked as excerpts. Should that still not
 * fit, the largest is cut short at a line.
 */
export function buildLibraryContext(
  videos: readonly LibraryContextVideo[],
  maxChars: number = MAX_LIBRARY_CONTEXT_CHARS,
): string {
  const blocks: LibraryBlock[] = videos.map((video) => ({
    video,
    lines: formatTranscriptForPrompt(video.segments),
    excerpt: false,
    cut: false,
  }));
  const render = () => blocks.map(renderLibraryVideo).join("\n\n");

  for (const block of blocks.toSorted((a, b) => b.lines.length - a.lines.length)) {
    if (render().length <= maxChars) break;
    const excerpt = excerptLines(block.video);
    if (excerpt.length < block.lines.length) {
      block.lines = excerpt;
      block.excerpt = true;
    }
  }

  if (render().length > maxChars) {
    const largest = blocks.reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
    // Marked first, so the note counts toward the budget too.
    largest.cut = true;
    const over = render().length - maxChars;
    const kept = largest.lines.slice(0, Math.max(0, largest.lines.length - over));
    largest.lines = kept.slice(0, Math.max(0, kept.lastIndexOf("\n")));
  }

  return render();
}

type LibraryBlock = {
  video: LibraryContextVideo;
  lines: string;
  /** Cut to the lines around the matches. */
  excerpt: boolean;
  /** Cut short at a line, when even excerpts were too long. */
  cut: boolean;
};

/** The transcript lines within EXCERPT_PADDING_SECONDS of the video's matches, with gaps marked. */
function excerptLines(video: LibraryContextVideo): string {
  const windows = video.matches
    .map(({ startSeconds, endSeconds }) => ({
      from: startSeconds - EXCERPT_PADDING_SECONDS,
      to: endSeconds + EXCERPT_PADDING_SECONDS,
    }))
    .toSorted((a, b) => a.from - b.from);
  const merged: { from: number; to: number }[] = [];
  for (const window of windows) {
    const last = merged.at(-1);
    if (last && window.from <= last.to) last.to = Math.max(last.to, window.to);
    else merged.push({ ...window });
  }

  return merged
    .map(({ from, to }) =>
      formatTranscriptForPrompt(video.segments.filter((cue) => cue.start >= from && cue.start < to)),
    )
    .filter(Boolean)
    .join("\n[…]\n");
}

function renderLibraryVideo({ video, lines, excerpt, cut }: LibraryBlock): string {
  return [
    `<video number="${video.index}">`,
    `Title: ${video.title}`,
    `Channel: ${video.channel}`,
    `Length: ${formatDuration(video.durationSeconds)}`,
    ...(excerpt
      ? ["Note: only excerpts, around the parts that matched the question. […] marks a gap."]
      : []),
    ...(cut ? ["Note: cut short to fit."] : []),
    ...(video.timestampsEstimated
      ? ["Note: timestamps are estimates, spread evenly over pasted text that had none."]
      : []),
    lines,
    "</video>",
  ].join("\n");
}

/**
 * The most recent `limit` messages, starting on a question: a history that
 * opened with an answer would leave Gemini an answer to nothing.
 */
export function trimHistory<T extends { role: MessageRole }>(
  messages: readonly T[],
  limit: number,
): T[] {
  if (limit <= 0) return [];
  const recent = messages.slice(-limit);
  const firstQuestion = recent.findIndex((message) => message.role === "user");
  return firstQuestion === -1 ? [] : recent.slice(firstQuestion);
}

/** Saved messages as the AI SDK's model messages. */
export function toModelMessages(
  rows: readonly { role: MessageRole; content: string }[],
): ModelMessage[] {
  return rows.map(({ role, content }) =>
    role === "user" ? { role: "user", content } : { role: "assistant", content },
  );
}

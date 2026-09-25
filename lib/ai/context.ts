// Pure builders for what a chat sends to Gemini: the transcript as prompt
// text, and the conversation so far as model messages.
import type { ModelMessage } from "ai";
import type { MessageRole } from "@/lib/chat/types";
import { PROMPT_LINE_SECONDS } from "@/lib/constants";
import { formatTimestamp } from "@/lib/time";
import type { TranscriptSegment } from "@/lib/transcript/types";

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

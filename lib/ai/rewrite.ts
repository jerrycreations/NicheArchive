import "server-only";
import { generateText } from "ai";
import { rewriteModel } from "@/lib/ai/models";
import { REWRITE_INSTRUCTIONS, rewritePrompt } from "@/lib/ai/prompts/rewrite";
import type { MessageRole } from "@/lib/chat/types";

// Someone is waiting on the answer, so the rewrite gets one quick try.
const TIMEOUT_MS = 10_000;

/** A longer rewrite has wandered off into answering, so the question is used as asked. */
const MAX_REWRITE_CHARS = 500;

// Wrapping the model sometimes adds: quotes, markdown and a label.
const LABEL = /^(?:standalone\s+|rewritten\s+)?question\s*:\s*/i;
const WRAPPING = /^["'“”‘’*_#`\s]+|["'“”‘’*_`\s]+$/g;

/**
 * The question to search the library with. A follow-up such as "what else
 * did they say about it?" is rewritten by the rewrite model into a question
 * that stands on its own, using the conversation so far. The first question
 * of a chat is used as asked, without a model call. Only search uses the
 * rewrite; the chat shows and saves what the user typed. Never throws: if
 * the call fails or returns nothing usable, the question is used as asked.
 */
export async function rewriteQuery(
  question: string,
  history: readonly { role: MessageRole; content: string }[],
): Promise<string> {
  if (history.length === 0) return question;
  try {
    const { text } = await generateText({
      model: rewriteModel(),
      instructions: REWRITE_INSTRUCTIONS,
      prompt: rewritePrompt(question, history),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const rewritten = cleanRewrite(text);
    return rewritten && rewritten.length <= MAX_REWRITE_CHARS ? rewritten : question;
  } catch (error) {
    console.warn("rewriteQuery failed, searching with the question as asked:", error);
    return question;
  }
}

/** The model's reply as a question: its first line without quotes, markdown or a label. */
function cleanRewrite(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  return firstLine
    .replace(/\s+/g, " ")
    .trim()
    .replace(WRAPPING, "")
    .replace(LABEL, "")
    .replace(WRAPPING, "")
    .trim();
}

import "server-only";
import { generateText } from "ai";
import { rewriteModel } from "@/lib/ai/models";
import { TITLE_INSTRUCTIONS, titlePrompt } from "@/lib/ai/prompts/title";
import { MAX_GENERATED_TITLE_CHARS } from "@/lib/constants";

// A title is a nicety, so it gets one quick try and never holds up a chat.
const TIMEOUT_MS = 10_000;

/** Shown for a chat whose first question had no words in it. */
const UNTITLED = "New chat";

/**
 * A short title for a chat, from its first question, written by the rewrite
 * model. Never throws: if the call fails or returns nothing usable, the
 * question itself is shortened instead.
 */
export async function generateChatTitle(question: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: rewriteModel(),
      instructions: TITLE_INSTRUCTIONS,
      prompt: titlePrompt(question),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return cleanGeneratedTitle(text) ?? fallbackTitle(question);
  } catch (error) {
    console.warn("generateChatTitle failed, using the question instead:", error);
    return fallbackTitle(question);
  }
}

// Wrapping the model sometimes adds: quotes, markdown and a label.
const LABEL = /^(?:chat\s+)?title\s*:\s*/i;
const WRAPPING = /^["'“”‘’*_#`\s]+|["'“”‘’*_`\s]+$/g;

/**
 * The model's reply as a title: its first line without a "Title:" label,
 * quotes, markdown or a trailing period, and shortened if it ran long.
 * Null when nothing is left.
 */
export function cleanGeneratedTitle(text: string): string | null {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  const title = firstLine
    .replace(/\s+/g, " ")
    .trim()
    .replace(WRAPPING, "")
    .replace(LABEL, "")
    .replace(WRAPPING, "")
    // One trailing period, but not an ellipsis.
    .replace(/(?<!\.)\.$/, "")
    .trim();
  return title ? fallbackTitle(title) : null;
}

/**
 * A question shortened into a title: whitespace collapsed and, when it's
 * longer than `max`, cut at the last word that fits with an ellipsis added.
 */
export function fallbackTitle(question: string, max = MAX_GENERATED_TITLE_CHARS): string {
  const text = question.replace(/\s+/g, " ").trim();
  if (!text) return UNTITLED;
  if (text.length <= max) return text;

  // Leave room for the ellipsis.
  const room = text.slice(0, max - 1);
  const endsOnWord = text[room.length] === " ";
  const lastSpace = room.lastIndexOf(" ");
  // A single long word is cut mid-word rather than left empty.
  const cut = endsOnWord || lastSpace <= 0 ? room : room.slice(0, lastSpace);
  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

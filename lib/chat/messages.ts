// Saved messages as the chat UI holds them. Used on both sides.
import type { UIMessage } from "ai";
import { sourcesPart } from "@/lib/chat/sources";
import type { MessageRow } from "@/lib/db/types";

/**
 * Saved messages as useChat's UI messages: a text part each, after a
 * `data-sources` part for a library answer, as it streamed in.
 */
export function toUIMessages(
  rows: readonly (Pick<MessageRow, "id" | "role" | "content"> & Partial<Pick<MessageRow, "sources">>)[],
): UIMessage[] {
  return rows.map(({ id, role, content, sources }) => ({
    id,
    role,
    parts: [...(sources ? [sourcesPart(sources)] : []), { type: "text", text: content }],
  }));
}

/** A UI message's text, from all its text parts. */
export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

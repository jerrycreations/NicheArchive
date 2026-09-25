// Saved messages as the chat UI holds them. Used on both sides.
import type { UIMessage } from "ai";
import type { MessageRow } from "@/lib/db/types";

/** Saved messages as useChat's UI messages, each a single text part. */
export function toUIMessages(rows: readonly Pick<MessageRow, "id" | "role" | "content">[]): UIMessage[] {
  return rows.map(({ id, role, content }) => ({ id, role, parts: [{ type: "text", text: content }] }));
}

/** A UI message's text, from all its text parts. */
export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

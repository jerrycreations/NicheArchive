import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createChatIfMissing, type NewChatValues } from "@/lib/db/queries/chats";
import { chats, messages } from "@/lib/db/schema";
import type { MessageRow, MessageSources } from "@/lib/db/types";

/**
 * A chat's messages, oldest first. A question and its answer are saved with
 * the same time, and the role enum sorts `user` first, so the question comes
 * before its answer.
 */
export async function listMessages(chatId: string): Promise<MessageRow[]> {
  return db()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.role));
}

/**
 * One side of an exchange. The ID is optional; the database makes one
 * otherwise. Only library answers have sources.
 */
export type ExchangeMessage = { id?: string; content: string; sources?: MessageSources };

/**
 * Saves a question and its answer together, in one transaction that also
 * creates the chat on its first exchange and moves it to the top of the
 * chat list. A question whose answer failed is never saved, so a chat never
 * exists without messages.
 */
export async function saveExchange(
  chat: NewChatValues,
  userMessage: ExchangeMessage,
  assistantMessage: ExchangeMessage,
): Promise<void> {
  await db().transaction(async (tx) => {
    await createChatIfMissing(chat, tx);
    // now() is the transaction's start time, so both messages and the chat's
    // updated_at share one timestamp.
    await tx.insert(messages).values([
      { id: userMessage.id, content: userMessage.content, chatId: chat.id, role: "user" },
      {
        id: assistantMessage.id,
        content: assistantMessage.content,
        sources: assistantMessage.sources ?? null,
        chatId: chat.id,
        role: "assistant",
      },
    ]);
    await tx.update(chats).set({ updatedAt: sql`now()` }).where(eq(chats.id, chat.id));
  });
}

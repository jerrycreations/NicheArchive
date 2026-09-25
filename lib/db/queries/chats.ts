import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ChatMode } from "@/lib/chat/types";
import { db, type Db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import type { ChatRow, ChatWithVideo } from "@/lib/db/types";

/** A transaction, for queries that also run inside one. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// What chat lists and headers show of a chat's video.
const VIDEO_SUMMARY = { id: true, youtubeId: true, title: true, channel: true } as const;

/** A chat as its first exchange creates it. `videoId` is set for video chats only. */
export type NewChatValues = { id: string; mode: ChatMode; videoId: string | null };

/** Thrown when a chat's ID already belongs to a chat of another mode, or about another video. */
export class ChatConflictError extends Error {
  constructor(chatId: string) {
    super(`Chat ${chatId} already exists with a different mode or video.`);
    this.name = "ChatConflictError";
  }
}

/**
 * Creates a chat unless one with its ID exists already, and returns it.
 * Throws ChatConflictError if the existing chat has another mode or video,
 * so a message can never land in a chat about something else.
 */
export async function createChatIfMissing(
  chat: NewChatValues,
  executor: Db | Tx = db(),
): Promise<ChatRow> {
  const [created] = await executor
    .insert(chats)
    .values(chat)
    .onConflictDoNothing({ target: chats.id })
    .returning();
  if (created) return created;

  const [existing] = await executor.select().from(chats).where(eq(chats.id, chat.id));
  if (!existing || existing.mode !== chat.mode || existing.videoId !== chat.videoId) {
    throw new ChatConflictError(chat.id);
  }
  return existing;
}

/** A chat with the video it's about, or null if there's no such chat. */
export async function getChat(id: string): Promise<ChatWithVideo | null> {
  const chat = await db().query.chats.findFirst({
    where: eq(chats.id, id),
    with: { video: { columns: VIDEO_SUMMARY } },
  });
  return chat ?? null;
}

/** Every chat, most recently active first, with the video each video chat is about. */
export async function listChats(): Promise<ChatWithVideo[]> {
  return db().query.chats.findMany({
    with: { video: { columns: VIDEO_SUMMARY } },
    orderBy: [desc(chats.updatedAt)],
  });
}

/** The chats about one video, most recently active first. */
export async function listChatsForVideo(videoId: string): Promise<ChatRow[]> {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.videoId, videoId))
    .orderBy(desc(chats.updatedAt));
}

/** Renames a chat. Returns false if it doesn't exist. */
export async function updateChatTitle(id: string, title: string): Promise<boolean> {
  const updated = await db()
    .update(chats)
    .set({ title })
    .where(eq(chats.id, id))
    .returning({ id: chats.id });
  return updated.length > 0;
}

/**
 * Gives a chat its generated title, unless it has one already, say because
 * someone renamed it first. Returns whether the title was set.
 */
export async function setChatTitleIfEmpty(id: string, title: string): Promise<boolean> {
  const updated = await db()
    .update(chats)
    .set({ title })
    .where(and(eq(chats.id, id), isNull(chats.title)))
    .returning({ id: chats.id });
  return updated.length > 0;
}

/** Deletes a chat; its messages cascade. Returns false if it was already gone. */
export async function deleteChatById(id: string): Promise<boolean> {
  const deleted = await db().delete(chats).where(eq(chats.id, id)).returning({ id: chats.id });
  return deleted.length > 0;
}

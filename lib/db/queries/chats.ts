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

/**
 * A chat as its first exchange creates it. `videoId` is set for video chats
 * only; `owner` is the name of whoever asked.
 */
export type NewChatValues = { id: string; mode: ChatMode; videoId: string | null; owner: string };

/**
 * Thrown when a chat's ID already belongs to a chat of another mode, about
 * another video, or someone else's.
 */
export class ChatConflictError extends Error {
  constructor(chatId: string) {
    super(`Chat ${chatId} already exists with a different mode, video or owner.`);
    this.name = "ChatConflictError";
  }
}

/**
 * Creates a chat unless one with its ID exists already, and returns it.
 * Throws ChatConflictError if the existing chat has another mode, video or
 * owner, so a message can never land in a chat about something else, or in
 * someone else's.
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
  if (
    !existing ||
    existing.mode !== chat.mode ||
    existing.videoId !== chat.videoId ||
    existing.owner !== chat.owner
  ) {
    throw new ChatConflictError(chat.id);
  }
  return existing;
}

/**
 * A chat with the video it's about, or null if there's no such chat. With an
 * owner, someone else's chat counts as missing too.
 */
export async function getChat(id: string, owner?: string): Promise<ChatWithVideo | null> {
  const chat = await db().query.chats.findFirst({
    where: owner === undefined ? eq(chats.id, id) : and(eq(chats.id, id), eq(chats.owner, owner)),
    with: { video: { columns: VIDEO_SUMMARY } },
  });
  return chat ?? null;
}

/** Someone's chats, most recently active first, with the video each video chat is about. */
export async function listChats(owner: string): Promise<ChatWithVideo[]> {
  return db().query.chats.findMany({
    where: eq(chats.owner, owner),
    with: { video: { columns: VIDEO_SUMMARY } },
    orderBy: [desc(chats.updatedAt)],
  });
}

/** Someone's chats about one video, most recently active first. */
export async function listChatsForVideo(videoId: string, owner: string): Promise<ChatRow[]> {
  return db()
    .select()
    .from(chats)
    .where(and(eq(chats.videoId, videoId), eq(chats.owner, owner)))
    .orderBy(desc(chats.updatedAt));
}

/** Renames one of `owner`'s chats. Returns false if they have no such chat. */
export async function updateChatTitle(id: string, owner: string, title: string): Promise<boolean> {
  const updated = await db()
    .update(chats)
    .set({ title })
    .where(and(eq(chats.id, id), eq(chats.owner, owner)))
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

/**
 * Deletes one of `owner`'s chats; its messages cascade. Returns false if they
 * have no such chat, say because it was already gone.
 */
export async function deleteChatById(id: string, owner: string): Promise<boolean> {
  const deleted = await db()
    .delete(chats)
    .where(and(eq(chats.id, id), eq(chats.owner, owner)))
    .returning({ id: chats.id });
  return deleted.length > 0;
}

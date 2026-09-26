"use server";

import { revalidatePath } from "next/cache";
import { actionError, unexpectedError, type ActionError } from "@/lib/actions/result";
import { getSession } from "@/lib/auth/require-session";
import { deleteChatById, updateChatTitle } from "@/lib/db/queries/chats";
import { SIGNED_OUT } from "@/lib/errors";
import {
  chatIdSchema,
  renameChatInputSchema,
  type RenameChatInput,
} from "@/lib/validation/chat";

export type RenameChatResult = { kind: "renamed"; title: string } | ActionError;

export type DeleteChatResult = { kind: "deleted" } | ActionError;

const NOT_A_CHAT = "That isn't a saved chat.";

/** Gives one of your chats a new title, trimmed, of 1 to 80 characters. */
export async function renameChat(input: RenameChatInput): Promise<RenameChatResult> {
  const session = await getSession();
  if (!session) return actionError(SIGNED_OUT);
  const parsed = renameChatInputSchema.safeParse(input);
  if (!parsed.success) {
    const titleIssue = parsed.error.issues.find((issue) => issue.path[0] === "title");
    return actionError(titleIssue?.message ?? NOT_A_CHAT);
  }
  const { chatId, title } = parsed.data;

  try {
    const renamed = await updateChatTitle(chatId, session.person, title);
    if (!renamed) return actionError("This chat doesn't exist anymore.");
  } catch (error) {
    return unexpectedError("renameChat", error, "Couldn't rename the chat. Try again.");
  }
  revalidatePath("/chats", "layout");
  return { kind: "renamed", title };
}

/** Deletes one of your chats and its messages. */
export async function deleteChat(chatId: string): Promise<DeleteChatResult> {
  const session = await getSession();
  if (!session) return actionError(SIGNED_OUT);
  const parsed = chatIdSchema.safeParse(chatId);
  if (!parsed.success) return actionError(NOT_A_CHAT);

  try {
    // Already gone, say because it was deleted in another tab, is fine too.
    await deleteChatById(parsed.data, session.person);
  } catch (error) {
    return unexpectedError("deleteChat", error, "Couldn't delete the chat. Try again.");
  }
  revalidatePath("/chats", "layout");
  return { kind: "deleted" };
}

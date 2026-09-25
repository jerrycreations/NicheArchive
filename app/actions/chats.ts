"use server";

import { revalidatePath } from "next/cache";
import { actionError, unexpectedError, type ActionError } from "@/lib/actions/result";
import { deleteChatById, updateChatTitle } from "@/lib/db/queries/chats";
import {
  chatIdSchema,
  renameChatInputSchema,
  type RenameChatInput,
} from "@/lib/validation/chat";

export type RenameChatResult = { kind: "renamed"; title: string } | ActionError;

export type DeleteChatResult = { kind: "deleted" } | ActionError;

const NOT_A_CHAT = "That isn't a saved chat.";

/** Gives a chat a new title, trimmed, of 1 to 80 characters. */
export async function renameChat(input: RenameChatInput): Promise<RenameChatResult> {
  const parsed = renameChatInputSchema.safeParse(input);
  if (!parsed.success) {
    const titleIssue = parsed.error.issues.find((issue) => issue.path[0] === "title");
    return actionError(titleIssue?.message ?? NOT_A_CHAT);
  }
  const { chatId, title } = parsed.data;

  try {
    const renamed = await updateChatTitle(chatId, title);
    if (!renamed) return actionError("This chat doesn't exist anymore.");
  } catch (error) {
    return unexpectedError("renameChat", error, "Couldn't rename the chat. Try again.");
  }
  revalidatePath("/chats", "layout");
  return { kind: "renamed", title };
}

/** Deletes a chat and its messages. */
export async function deleteChat(chatId: string): Promise<DeleteChatResult> {
  const parsed = chatIdSchema.safeParse(chatId);
  if (!parsed.success) return actionError(NOT_A_CHAT);

  try {
    // Already gone, say because the other person deleted it first, is fine too.
    await deleteChatById(parsed.data);
  } catch (error) {
    return unexpectedError("deleteChat", error, "Couldn't delete the chat. Try again.");
  }
  revalidatePath("/chats", "layout");
  return { kind: "deleted" };
}

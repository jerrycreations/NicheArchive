import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { ChatView } from "@/components/chats/chat-view";
import { toUIMessages } from "@/lib/chat/messages";
import { UNTITLED_CHAT } from "@/lib/chat/modes";
import { getChat } from "@/lib/db/queries/chats";
import { listMessages } from "@/lib/db/queries/messages";
import { chatIdSchema } from "@/lib/validation/chat";

// Shared by the metadata and the page within one request.
const loadChat = cache(async (id: string) =>
  chatIdSchema.safeParse(id).success ? getChat(id) : null,
);

export async function generateMetadata({ params }: PageProps<"/chats/[id]">): Promise<Metadata> {
  const { id } = await params;
  const chat = await loadChat(id);
  return { title: chat ? (chat.title ?? UNTITLED_CHAT) : "Chat not found" };
}

export default async function ChatPage({ params }: PageProps<"/chats/[id]">) {
  // Database reads don't make a page dynamic on their own (see the library page).
  await connection();
  const { id } = await params;
  const chat = await loadChat(id);
  if (!chat) notFound();
  const messages = toUIMessages(await listMessages(chat.id));

  // Keyed, so opening another chat starts a fresh conversation state.
  return <ChatView key={chat.id} chat={chat} initialMessages={messages} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { ChatView } from "@/components/chats/chat-view";
import { DatabaseUnavailable } from "@/components/common/error-state";
import { toUIMessages } from "@/lib/chat/messages";
import { UNTITLED_CHAT } from "@/lib/chat/modes";
import { citedYoutubeIds } from "@/lib/chat/sources";
import { getChat } from "@/lib/db/queries/chats";
import { listMessages } from "@/lib/db/queries/messages";
import { existingYoutubeIds } from "@/lib/db/queries/videos";
import { unlessDatabaseDown } from "@/lib/errors";
import { chatIdSchema } from "@/lib/validation/chat";

// Shared by the metadata and the page within one request.
const loadChat = cache(async (id: string) =>
  chatIdSchema.safeParse(id).success ? getChat(id) : null,
);

export async function generateMetadata({ params }: PageProps<"/chats/[id]">): Promise<Metadata> {
  const { id } = await params;
  const loaded = await unlessDatabaseDown(() => loadChat(id));
  if (!loaded.ok) return { title: "Chat" };
  const chat = loaded.value;
  return { title: chat ? (chat.title ?? UNTITLED_CHAT) : "Chat not found" };
}

export default async function ChatPage({ params }: PageProps<"/chats/[id]">) {
  // Database reads don't make a page dynamic on their own (see the library page).
  await connection();
  const { id } = await params;
  const loaded = await unlessDatabaseDown(async () => {
    const chat = await loadChat(id);
    if (!chat) return null;
    const rows = await listMessages(chat.id);
    // Library answers keep their sources after a cited video is deleted.
    const cited = citedYoutubeIds(rows);
    const existing = await existingYoutubeIds(cited);
    const deleted = cited.filter((youtubeId) => !existing.has(youtubeId));
    return { chat, rows, deleted };
  });
  if (!loaded.ok) return <DatabaseUnavailable className="h-full justify-center" />;
  if (!loaded.value) notFound();
  const { chat, rows, deleted } = loaded.value;

  // Keyed, so opening another chat starts a fresh conversation state.
  return (
    <ChatView
      key={chat.id}
      chat={chat}
      initialMessages={toUIMessages(rows)}
      deletedYoutubeIds={deleted}
    />
  );
}

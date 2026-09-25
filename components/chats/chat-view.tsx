"use client";

import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatHeader } from "@/components/chats/chat-header";
import { CHAT_MODE_PLACEHOLDERS } from "@/lib/chat/modes";
import type { ChatWithVideo } from "@/lib/db/types";

/**
 * A saved chat on its own page, to read and continue. There's no player
 * here, so timestamps open the video's page at that moment.
 */
export function ChatView({
  chat,
  initialMessages,
}: {
  chat: ChatWithVideo;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border">
      <ChatHeader chat={chat} />
      <ChatPanel
        chatId={chat.id}
        mode={chat.mode}
        youtubeId={chat.video?.youtubeId}
        initialMessages={initialMessages}
        placeholder={CHAT_MODE_PLACEHOLDERS[chat.mode]}
        // Moves the chat to the top of the list.
        onReplyFinished={() => router.refresh()}
        className="flex-1"
      />
    </div>
  );
}

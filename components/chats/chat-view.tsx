"use client";

import type { UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";
import { DeletedVideosProvider } from "@/components/chat/deleted-videos";
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
  deletedYoutubeIds,
}: {
  chat: ChatWithVideo;
  initialMessages: UIMessage[];
  /** Videos that library answers here cite but that have been deleted since. */
  deletedYoutubeIds: string[];
}) {
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border">
      <ChatHeader chat={chat} />
      <DeletedVideosProvider youtubeIds={deletedYoutubeIds}>
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
      </DeletedVideosProvider>
    </div>
  );
}

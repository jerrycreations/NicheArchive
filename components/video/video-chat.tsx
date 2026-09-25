"use client";

import type { UIMessage } from "ai";
import { HistoryIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { StarterPrompts } from "@/components/chat/starter-prompts";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UNTITLED_CHAT } from "@/lib/chat/modes";
import type { ChatRow } from "@/lib/db/types";
import { chatPath } from "@/lib/navigation";
import type { TranscriptStatus } from "@/lib/transcript/types";

export type VideoChatSummary = Pick<ChatRow, "id" | "title" | "updatedAt">;

type OpenChat = {
  /** Remounts the panel for a new chat. */
  key: string;
  /** Unset for a new chat, which gets its ID when its first question is sent. */
  chatId?: string;
  initialMessages: UIMessage[];
};

const NOT_READY: Partial<Record<TranscriptStatus, string>> = {
  pending: "You can ask questions once the transcript is ready.",
  failed: "Add the transcript to ask questions about this video.",
};

/**
 * The chat column of a video page. It opens the video's most recent chat,
 * or starter prompts when there's none yet, and lists the earlier chats,
 * which open on the Chats page. Timestamps in answers play the player here.
 */
export function VideoChat({
  youtubeId,
  status,
  chats,
  latestMessages,
  now,
}: {
  youtubeId: string;
  status: TranscriptStatus;
  /** The video's chats, most recently active first. */
  chats: VideoChatSummary[];
  /** The messages of the first of `chats`. */
  latestMessages: UIMessage[];
  /** When the server rendered the page, for "5m ago". */
  now: Date;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OpenChat>(() =>
    chats[0]
      ? { key: chats[0].id, chatId: chats[0].id, initialMessages: latestMessages }
      : { key: "first", initialMessages: [] },
  );
  // A new chat's ID, once its first question is sent.
  const [startedId, setStartedId] = useState<string | null>(null);

  const openId = open.chatId ?? startedId;
  const started = open.initialMessages.length > 0 || startedId !== null;
  const earlier = chats.filter((chat) => chat.id !== openId);
  const openChat = chats.find((chat) => chat.id === openId);
  // A new chat isn't among `chats` until its first answer is saved.
  const title = openChat ? (openChat.title ?? UNTITLED_CHAT) : "New chat";
  const notReady = NOT_READY[status];

  function startNewChat() {
    setOpen({ key: crypto.randomUUID(), initialMessages: [] });
    setStartedId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border">
      <div className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
        {earlier.length > 0 && <EarlierChats chats={earlier} now={now} />}
        <Button type="button" variant="ghost" size="sm" onClick={startNewChat} disabled={!started}>
          <PlusIcon />
          New chat
        </Button>
      </div>
      <ChatPanel
        key={open.key}
        chatId={open.chatId}
        mode="video"
        youtubeId={youtubeId}
        initialMessages={open.initialMessages}
        disabled={notReady !== undefined}
        notice={notReady && <p className="text-sm text-muted-foreground">{notReady}</p>}
        placeholder="Ask about this video"
        renderEmpty={(send) => (
          <StarterPrompts onSelect={send} disabled={notReady !== undefined} />
        )}
        onFirstMessageSent={setStartedId}
        // Brings in the new chat's title and its place among the earlier ones.
        onReplyFinished={() => router.refresh()}
        className="flex-1"
      />
    </div>
  );
}

function EarlierChats({ chats, now }: { chats: VideoChatSummary[]; now: Date }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <HistoryIcon />
          Earlier
          <span className="sr-only"> chats</span>
          <span className="text-muted-foreground tabular-nums">{chats.length}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Earlier chats about this video</DropdownMenuLabel>
        {chats.map((chat) => (
          <DropdownMenuItem key={chat.id} asChild>
            <Link href={chatPath(chat.id)}>
              <span className="min-w-0 flex-1 truncate">{chat.title ?? UNTITLED_CHAT}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <RelativeTime value={chat.updatedAt} now={now} />
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

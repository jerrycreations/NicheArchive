"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { ChatMenu } from "@/components/chats/chat-menu";
import { ChatModeIcon } from "@/components/chats/mode-icon";
import { CHAT_MODE_LABELS, UNTITLED_CHAT } from "@/lib/chat/modes";
import type { ChatWithVideo } from "@/lib/db/types";
import { videoPath } from "@/lib/navigation";

/** The open chat's title, mode and video, with its menu. */
export function ChatHeader({ chat }: { chat: ChatWithVideo }) {
  const [title, setTitle] = useOptimistic(chat.title ?? UNTITLED_CHAT);

  return (
    <header className="flex items-start gap-2 border-b py-2 pr-2 pl-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 className="truncate leading-7 font-medium">{title}</h1>
        <ChatModeLine mode={chat.mode} video={chat.video} />
      </div>
      <ChatMenu chatId={chat.id} title={title} onRename={setTitle} className="mt-0.5" />
    </header>
  );
}

/** A chat's mode, and for a video chat a link to its video. */
export function ChatModeLine({
  mode,
  video,
}: {
  mode: ChatWithVideo["mode"];
  video: Pick<NonNullable<ChatWithVideo["video"]>, "youtubeId" | "title"> | null;
}) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <ChatModeIcon mode={mode} className="size-3.5 shrink-0" />
      <span className="shrink-0">{CHAT_MODE_LABELS[mode]}</span>
      {video && (
        <>
          <span aria-hidden>·</span>
          <Link
            href={videoPath(video.youtubeId)}
            className="truncate underline-offset-4 hover:text-foreground hover:underline"
          >
            {video.title}
          </Link>
        </>
      )}
    </p>
  );
}

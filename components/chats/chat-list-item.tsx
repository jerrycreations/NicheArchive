"use client";

import Image from "next/image";
import Link from "next/link";
import { useOptimistic } from "react";
import { ChatMenu } from "@/components/chats/chat-menu";
import { ChatModeIcon } from "@/components/chats/mode-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { CHAT_MODE_LABELS, UNTITLED_CHAT } from "@/lib/chat/modes";
import type { ChatWithVideo } from "@/lib/db/types";
import { chatPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { buildThumbnailUrl } from "@/lib/youtube/url";

/**
 * One chat in the list: its video's thumbnail (or its mode's icon), title,
 * video, mode and when it was last active. As on a library card, the title's
 * link stretches over the row, so the menu sits on top of it instead of
 * inside a link.
 */
export function ChatListItem({
  chat,
  active,
  now,
  onNavigate,
}: {
  chat: ChatWithVideo;
  /** The chat that's open. */
  active: boolean;
  /** When the server rendered the list, for "5m ago". */
  now: Date;
  /** After the link is followed, e.g. to close the drawer. */
  onNavigate?: () => void;
}) {
  const [title, setTitle] = useOptimistic(chat.title ?? UNTITLED_CHAT);

  return (
    <li
      className={cn(
        "relative flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        active && "bg-muted hover:bg-muted",
      )}
    >
      <ChatThumbnail chat={chat} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={chatPath(chat.id)}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
          className="truncate text-sm leading-5 font-medium outline-none after:absolute after:inset-0"
        >
          {title}
        </Link>
        {chat.video && (
          <p className="truncate text-xs text-muted-foreground">{chat.video.title}</p>
        )}
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <ChatModeIcon mode={chat.mode} className="size-3 shrink-0" />
          <span className="truncate">{CHAT_MODE_LABELS[chat.mode]}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">
            <RelativeTime value={chat.updatedAt} now={now} />
          </span>
        </p>
      </div>
      {/* Above the stretched title link. */}
      <ChatMenu
        chatId={chat.id}
        title={title}
        onRename={setTitle}
        className="relative z-10 -my-0.5 -mr-1 shrink-0"
      />
    </li>
  );
}

// A video chat shows its video; the others their mode's icon, in the same box.
function ChatThumbnail({ chat }: { chat: ChatWithVideo }) {
  return (
    <div className="relative mt-0.5 flex aspect-video w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
      {chat.video ? (
        // YouTube already serves sized JPEGs, so Vercel's optimizer is skipped.
        <Image
          src={buildThumbnailUrl(chat.video.youtubeId)}
          alt=""
          fill
          unoptimized
          sizes="64px"
          className="object-cover"
        />
      ) : (
        <ChatModeIcon mode={chat.mode} className="size-4" />
      )}
    </div>
  );
}

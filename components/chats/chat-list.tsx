"use client";

import { SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChatListItem } from "@/components/chats/chat-list-item";
import { EmptyChats } from "@/components/chats/empty-chats";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatWithVideo } from "@/lib/db/types";
import { chatPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Every chat, most recently active first, under a New chat link. The open
 * chat is highlighted. It scrolls on its own, inside whatever height it's given.
 */
export function ChatList({
  chats,
  now,
  onNavigate,
  className,
}: {
  chats: ChatWithVideo[];
  /** When the server rendered the list, for "5m ago". */
  now: Date;
  /** After a link is followed, e.g. to close the drawer. */
  onNavigate?: () => void;
  className?: string;
}) {
  // From the browser's URL, which also follows a new chat's replaceState.
  const pathname = usePathname();

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <Button asChild variant="outline" className="justify-start">
        <Link href="/chats" onClick={onNavigate}>
          <SquarePenIcon data-icon="inline-start" />
          New chat
        </Link>
      </Button>
      {chats.length === 0 ? (
        <EmptyChats />
      ) : (
        <ul aria-label="Chats" className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {chats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              active={pathname === chatPath(chat.id)}
              now={now}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The list's shape while it loads: New chat, then rows shaped like ChatListItem. */
export function ChatListSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} aria-hidden>
      <Skeleton className="h-8 w-full" />
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-start gap-3 p-2">
            <Skeleton className="mt-0.5 aspect-video w-16 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-4/5" />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="-my-0.5 -mr-1 size-7 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

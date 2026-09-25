"use client";

import { PanelLeftIcon } from "lucide-react";
import { useState } from "react";
import { ChatList } from "@/components/chats/chat-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ChatWithVideo } from "@/lib/db/types";

/** Below `lg`, the chat list opens in a drawer from the left. */
export function ChatListDrawer({ chats, now }: { chats: ChatWithVideo[]; now: Date }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <PanelLeftIcon data-icon="inline-start" />
          All chats
          <span className="text-muted-foreground tabular-nums">{chats.length}</span>
        </Button>
      </SheetTrigger>
      {/* Wider than the sheet's usual 3/4, so rows keep their mode and time on phones. */}
      <SheetContent side="left" className="gap-0 data-[side=left]:w-[90vw]">
        <SheetHeader>
          <SheetTitle>Chats</SheetTitle>
          <SheetDescription className="sr-only">
            Your saved chats, most recently active first.
          </SheetDescription>
        </SheetHeader>
        <ChatList
          chats={chats}
          now={now}
          onNavigate={() => setOpen(false)}
          className="flex-1 px-4"
        />
      </SheetContent>
    </Sheet>
  );
}

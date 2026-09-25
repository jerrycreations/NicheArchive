"use client";

import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { DeleteChatDialog } from "@/components/chats/delete-chat-dialog";
import { RenameChatDialog } from "@/components/chats/rename-chat-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** A chat's overflow menu, in the chat list and on the chat's own page. */
export function ChatMenu({
  chatId,
  title,
  onRename,
  className,
}: {
  chatId: string;
  title: string;
  /** Shows a new title right away; see RenameChatDialog. */
  onRename: (title: string) => void;
  className?: string;
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground", className)}
            aria-label={`Actions for ${title}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <PencilIcon />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Beside the menu rather than inside it, so the menu can close as a dialog opens. */}
      <RenameChatDialog
        chatId={chatId}
        title={title}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onRename={onRename}
        returnFocusTo={triggerRef}
      />
      <DeleteChatDialog
        chatId={chatId}
        title={title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        returnFocusTo={triggerRef}
      />
    </>
  );
}

"use client";

import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteVideoDialog } from "@/components/video/delete-video-dialog";
import { cn } from "@/lib/utils";

/** A video's overflow menu, on its library card and on its own page. */
export function VideoActionsMenu({
  youtubeId,
  title,
  chatCount,
  className,
}: {
  youtubeId: string;
  title: string;
  /** Chats about the video, which deleting it also deletes. */
  chatCount: number;
  className?: string;
}) {
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
            <EllipsisVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Beside the menu rather than inside it, so the menu can close as the dialog opens. */}
      <DeleteVideoDialog
        youtubeId={youtubeId}
        title={title}
        chatCount={chatCount}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        returnFocusTo={triggerRef}
      />
    </>
  );
}

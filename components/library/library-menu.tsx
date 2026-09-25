"use client";

import { EllipsisIcon, RefreshCwIcon } from "lucide-react";
import { useRef, useState } from "react";
import { ReindexDialog } from "@/components/library/reindex-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The library page's overflow menu, for actions on the whole library. */
export function LibraryMenu() {
  const [reindexOpen, setReindexOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Library actions"
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setReindexOpen(true)}>
            <RefreshCwIcon />
            Re-index all…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Beside the menu rather than inside it, so the menu can close as the dialog opens. */}
      <ReindexDialog open={reindexOpen} onOpenChange={setReindexOpen} returnFocusTo={triggerRef} />
    </>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { deleteVideo, type DeleteVideoResult } from "@/app/actions/videos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { actionError } from "@/lib/actions/result";
import { SERVER_UNREACHABLE } from "@/lib/errors";
import { videoPath } from "@/lib/navigation";

/** e.g. "its transcript, its search index and 2 chats about it". */
function whatGoesWithIt(chatCount: number): string {
  if (chatCount === 0) return "its transcript and its search index";
  const chats = chatCount === 1 ? "1 chat" : `${chatCount} chats`;
  return `its transcript, its search index and ${chats} about it`;
}

export function DeleteVideoDialog({
  youtubeId,
  title,
  chatCount,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  youtubeId: string;
  title: string;
  chatCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, since nothing in the dialog opened it. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      let result: DeleteVideoResult;
      try {
        result = await deleteVideo(youtubeId);
      } catch {
        result = actionError(SERVER_UNREACHABLE);
      }
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(`Deleted “${title}”`);
      // Updates after an await need their own transition to commit together.
      // The video's own page is gone, and navigating inside this transition
      // keeps its not-found render from showing on the way out.
      startTransition(() => {
        onOpenChange(false);
        if (pathname === videoPath(youtubeId)) router.replace("/library");
      });
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Stays open while deleting, so a failure has somewhere to show.
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          // After a delete from the library the card, and its menu, are gone.
          const target = returnFocusTo?.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete “${title}”?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {`This removes ${whatGoesWithIt(chatCount)}. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              // The action button closes the dialog by default.
              event.preventDefault();
              confirmDelete();
            }}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

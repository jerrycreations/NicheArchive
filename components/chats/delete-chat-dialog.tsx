"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { deleteChat, type DeleteChatResult } from "@/app/actions/chats";
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
import { chatPath } from "@/lib/navigation";

/** Confirms deleting a chat, then goes back to /chats if that chat was open. */
export function DeleteChatDialog({
  chatId,
  title,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  chatId: string;
  title: string;
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
      let result: DeleteChatResult;
      try {
        result = await deleteChat(chatId);
      } catch {
        result = actionError("Couldn't reach the server. Try again.");
      }
      if (result.kind === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(`Deleted “${title}”`);
      // Updates after an await need their own transition to commit together.
      // Navigating inside it keeps the deleted chat's not-found render from
      // showing on the way out, as with deleting a video.
      startTransition(() => {
        onOpenChange(false);
        if (pathname === chatPath(chatId)) router.replace("/chats");
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
          // After a delete, the row and its menu are gone.
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
            This removes the chat and all its messages. This can&apos;t be undone.
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

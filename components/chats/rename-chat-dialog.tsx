"use client";

import { useId, useState, useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { renameChat, type RenameChatResult } from "@/app/actions/chats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { actionError } from "@/lib/actions/result";
import { MAX_CHAT_TITLE_CHARS } from "@/lib/constants";
import { SERVER_UNREACHABLE } from "@/lib/errors";
import { chatTitleSchema } from "@/lib/validation/chat";

/**
 * Renames a chat. The new title shows at once through `onRename`, an
 * optimistic setter; if saving fails, it goes back to the old one and a
 * toast says why.
 */
export function RenameChatDialog({
  chatId,
  title,
  open,
  onOpenChange,
  onRename,
  returnFocusTo,
}: {
  chatId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows the new title until the server's copy arrives. Called inside a transition. */
  onRename: (title: string) => void;
  /** Where focus goes on close, since nothing in the dialog opened it. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const [, startTransition] = useTransition();

  function save(next: string) {
    onOpenChange(false);
    if (next === title) return;
    startTransition(async () => {
      onRename(next);
      let result: RenameChatResult;
      try {
        result = await renameChat({ chatId, title: next });
      } catch {
        result = actionError(SERVER_UNREACHABLE);
      }
      if (result.kind === "error") toast.error(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>
            {`Give it a title of up to ${MAX_CHAT_TITLE_CHARS} characters.`}
          </DialogDescription>
        </DialogHeader>
        {/* The content unmounts on close, so each opening starts from the current title. */}
        <RenameForm title={title} onSave={save} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [value, setValue] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = chatTitleSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "That title can't be used.");
          return;
        }
        onSave(parsed.data);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Title
        </label>
        <Input
          id={inputId}
          value={value}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
        />
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

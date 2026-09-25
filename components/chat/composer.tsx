"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Where questions are typed. Enter sends and Shift+Enter starts a new line.
 * While an answer is on its way the text can't change, and Stop replaces
 * Send.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled = false,
  placeholder = "Ask a question",
  textareaRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** An answer is on its way. */
  busy: boolean;
  /** Nothing can be asked here yet, e.g. while the transcript is processing. */
  disabled?: boolean;
  placeholder?: string;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  className?: string;
}) {
  const canSend = !busy && !disabled && value.trim() !== "";

  return (
    <form
      className={cn("flex items-end gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <Textarea
        ref={textareaRef}
        name="message"
        aria-label="Message"
        placeholder={placeholder}
        rows={1}
        maxLength={MAX_CHAT_MESSAGE_CHARS}
        // Read-only rather than disabled while busy, so focus stays here for
        // the next question.
        readOnly={busy}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Not while an input method is composing a character.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className="max-h-48 min-h-9 resize-none py-1.5"
      />
      {busy ? (
        <Button type="button" size="icon" variant="outline" onClick={onStop} aria-label="Stop the answer">
          <SquareIcon className="fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Send">
          <ArrowUpIcon />
        </Button>
      )}
    </form>
  );
}

/**
 * The chat panel's bottom bar while a chat loads: the composer at the
 * messages' reading width. The textarea is 38px tall on phones, where its
 * text is larger, and 36px from `md`.
 */
export function ComposerSkeleton() {
  return (
    <div className="border-t p-3" aria-hidden>
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <Skeleton className="h-9.5 flex-1 md:h-9" />
        <Skeleton className="size-8 shrink-0" />
      </div>
    </div>
  );
}

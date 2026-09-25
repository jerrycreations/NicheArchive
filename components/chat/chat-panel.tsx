"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { ChatError } from "@/components/chat/chat-error";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { takeComposerFocus } from "@/lib/chat/composer-focus";
import type { CitationHref } from "@/lib/chat/remark-citations";
import type { ChatMode } from "@/lib/chat/types";
import { useArchiveChat } from "@/lib/chat/use-archive-chat";
import { videoPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * A chat: its messages, any error, and the composer. It fills the height
 * its parent gives it, and the messages scroll inside.
 */
export function ChatPanel({
  chatId,
  mode,
  youtubeId,
  initialMessages,
  renderHeader,
  renderEmpty,
  startWith,
  notice,
  disabled = false,
  placeholder,
  onFirstMessageSent,
  onReplyFinished,
  className,
}: {
  /** Omit for a new chat. */
  chatId?: string;
  mode: ChatMode;
  /** The video a video chat is about. Its timestamps link there. */
  youtubeId?: string;
  initialMessages?: UIMessage[];
  /** Above the messages. `started` once a question is in the chat, and again false if it failed. */
  renderHeader?: (state: { started: boolean }) => React.ReactNode;
  /** Shown instead of the messages until the chat has any. Gets `send`, e.g. for starter prompts. */
  renderEmpty?: (send: (text: string) => void) => React.ReactNode;
  /** A first question to send once, as soon as the chat can take it. */
  startWith?: string;
  /** A note above the composer, e.g. why the chat is disabled. */
  notice?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
  onFirstMessageSent?: (chatId: string) => void;
  onReplyFinished?: (event: { chatId: string; first: boolean }) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chat = useArchiveChat({
    chatId,
    mode,
    youtubeId,
    initialMessages,
    onSent: ({ first }) => {
      // A starter prompt that sent the question goes away with the empty state.
      textareaRef.current?.focus();
      if (first) onFirstMessageSent?.(chat.id);
    },
    onReplyFinished: ({ first }) => onReplyFinished?.({ chatId: chat.id, first }),
    // The question comes back to the composer, to send again or change.
    onFailed: (text) => {
      setDraft(text);
      textareaRef.current?.focus();
    },
  });

  // Focus handed over from the new chat this page replaced.
  useEffect(() => {
    if (chatId && takeComposerFocus(chatId)) textareaRef.current?.focus();
  }, [chatId]);

  // Once only, even though this runs after every render.
  const startedWithRef = useRef(false);
  useEffect(() => {
    if (!startWith || disabled || startedWithRef.current) return;
    startedWithRef.current = true;
    chat.send(startWith);
  }, [startWith, disabled, chat]);

  const citationHref: CitationHref | undefined = youtubeId
    ? (citation) =>
        // Numbered citations belong to library answers, which have no one video.
        citation.source === undefined
          ? `${videoPath(youtubeId)}?t=${Math.floor(citation.seconds)}`
          : null
    : undefined;

  return (
    <section aria-label="Chat" className={cn("flex min-h-0 flex-col", className)}>
      {renderHeader?.({ started: chat.messages.length > 0 })}
      {chat.messages.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto w-full max-w-3xl">{renderEmpty?.(chat.send)}</div>
        </div>
      ) : (
        <MessageList
          messages={chat.messages}
          waiting={chat.waiting}
          busy={chat.busy}
          citationHref={citationHref}
          className="flex-1"
        />
      )}
      <div className="border-t p-3">
        {/* The messages' reading width. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {chat.error && (
            <ChatError
              message={chat.error}
              onRetry={
                disabled
                  ? undefined
                  : () => {
                      setDraft("");
                      chat.retry();
                    }
              }
              onDismiss={chat.dismissError}
            />
          )}
          {notice}
          <Composer
            textareaRef={textareaRef}
            value={draft}
            onChange={setDraft}
            busy={chat.busy}
            disabled={disabled}
            placeholder={placeholder}
            onSend={() => {
              chat.send(draft);
              setDraft("");
            }}
            onStop={chat.stop}
          />
        </div>
      </div>
    </section>
  );
}

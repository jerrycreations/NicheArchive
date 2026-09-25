"use client";

import type { UIMessage } from "ai";
import { useLayoutEffect, useRef } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { messageText } from "@/lib/chat/messages";
import type { CitationHref } from "@/lib/chat/remark-citations";
import { cn } from "@/lib/utils";

// Within this many pixels of the end still counts as reading the end.
const NEAR_BOTTOM_PX = 48;

/**
 * The conversation, scrolling on its own. It follows an answer as it streams
 * in, unless the reader has scrolled up to read something earlier; sending
 * a question always brings the end back into view.
 */
export function MessageList({
  messages,
  waiting,
  busy,
  citationHref,
  className,
}: {
  messages: UIMessage[];
  /** The answer hasn't started yet. */
  waiting: boolean;
  /** An answer is on its way or streaming. */
  busy: boolean;
  citationHref?: CitationHref;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const lastQuestionRef = useRef<string | undefined>(undefined);

  const lastQuestion = messages.findLast((message) => message.role === "user")?.id;
  const last = messages.at(-1);
  // Also while an answer has started but has no text yet.
  const typing = waiting || (busy && last?.role === "assistant" && !messageText(last));

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (lastQuestion !== lastQuestionRef.current) {
      lastQuestionRef.current = lastQuestion;
      followRef.current = true;
    }
    if (followRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, typing, lastQuestion]);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        followRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
      }}
      className={cn("min-h-0 overflow-y-auto overscroll-contain", className)}
    >
      {/* A reading width, for wide chats on the Chats page. */}
      <div role="log" aria-busy={busy} className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
        {messages.map((message) =>
          message.role === "assistant" && !messageText(message) ? null : (
            <MessageBubble key={message.id} message={message} citationHref={citationHref} />
          ),
        )}
        {typing && <TypingIndicator />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div role="status" className="flex h-6 items-center gap-1" aria-label="Gemini is answering">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

"use client";

import type { UIMessage } from "ai";
import { Markdown } from "@/components/chat/markdown";
import { messageText } from "@/lib/chat/messages";
import type { CitationHref } from "@/lib/chat/remark-citations";

/**
 * One message. Questions sit on the right in a tinted bubble, as typed;
 * answers take the full width as Markdown, with their timestamps linked.
 */
export function MessageBubble({
  message,
  citationHref,
}: {
  message: UIMessage;
  citationHref?: CitationHref;
}) {
  const text = messageText(message);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm leading-6 break-words whitespace-pre-wrap">
          <span className="sr-only">You: </span>
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm leading-6">
      <span className="sr-only">Gemini: </span>
      <Markdown text={text} citationHref={citationHref} />
    </div>
  );
}

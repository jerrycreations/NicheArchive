"use client";

import type { UIMessage } from "ai";
import { useDeletedVideos } from "@/components/chat/deleted-videos";
import { Markdown } from "@/components/chat/markdown";
import { NoMatchReply } from "@/components/chat/no-match-reply";
import { SourcesRow } from "@/components/chat/sources-row";
import { messageText } from "@/lib/chat/messages";
import type { CitationHref } from "@/lib/chat/remark-citations";
import { isNoMatchAnswer, libraryCitationHref, messageSources } from "@/lib/chat/sources";

/**
 * One message. Questions sit on the right in a tinted bubble, as typed;
 * answers take the full width as Markdown, with their timestamps linked.
 * A library answer also shows the videos it's from, or when it found
 * nothing, a way to ask plain Gemini instead.
 */
export function MessageBubble({
  message,
  question = null,
  citationHref,
}: {
  message: UIMessage;
  /** For an answer, the question it replies to. */
  question?: string | null;
  citationHref?: CitationHref;
}) {
  const deleted = useDeletedVideos();
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

  const sources = messageSources(message);
  const videos = sources?.kind === "videos" ? sources.videos : null;
  const answer = (
    <Markdown
      text={text}
      citationHref={videos ? libraryCitationHref(videos, deleted) : citationHref}
    />
  );

  return (
    <div className="text-sm leading-6">
      <span className="sr-only">Gemini: </span>
      {sources?.kind === "no_match" ? (
        <NoMatchReply question={sources.question}>{answer}</NoMatchReply>
      ) : videos && isNoMatchAnswer(text) ? (
        // The videos search found didn't answer it after all.
        <NoMatchReply question={question}>{answer}</NoMatchReply>
      ) : (
        <>
          {answer}
          {videos && <SourcesRow videos={videos} deletedYoutubeIds={deleted} />}
        </>
      )}
    </div>
  );
}

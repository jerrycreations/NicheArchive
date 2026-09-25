// A library answer's sources: the videos it drew on, or the question that
// matched nothing. Saved with the answer and streamed ahead of it as a
// `data-sources` message part. Used on both sides.
import type { UIMessage } from "ai";
import { z } from "zod";
import type { CitationHref } from "@/lib/chat/remark-citations";
import type { MessageSources, MessageSourceVideo } from "@/lib/db/types";
import { videoPath } from "@/lib/navigation";

/**
 * The fixed reply when library search finds nothing good enough to answer
 * from. Gemini is told to give exactly this when the videos it was sent
 * don't answer the question either.
 */
export const NO_MATCH_REPLY = "I couldn't find this in your videos.";

/** The UI message part that carries a library answer's sources. */
export const SOURCES_PART = "data-sources";

const sourceVideoSchema = z.object({
  index: z.number().int().positive(),
  youtubeId: z.string(),
  title: z.string(),
  channel: z.string(),
  timestamps: z.array(z.number().nonnegative()),
});

export const messageSourcesSchema: z.ZodType<MessageSources> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("videos"), videos: z.array(sourceVideoSchema) }),
  z.object({ kind: z.literal("no_match"), question: z.string() }),
]);

/** Sources read back from the database or a stream, or null when they don't fit the schema. */
export function parseMessageSources(value: unknown): MessageSources | null {
  const parsed = messageSourcesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** A message's sources, from its `data-sources` part. */
export function messageSources(message: UIMessage): MessageSources | null {
  const part = message.parts.find((candidate) => candidate.type === SOURCES_PART);
  return part && "data" in part ? parseMessageSources(part.data) : null;
}

/** The `data-sources` part that carries sources in a UI message. */
export function sourcesPart(sources: MessageSources) {
  return { type: SOURCES_PART, data: sources } as const;
}

/**
 * Where a library answer's citations go: `[n @ m:ss]` to video n's page at
 * that time. A bare `[m:ss]` goes to the only video when there's just one.
 * Citations of a video that's gone, or isn't among the sources, stay text.
 */
export function libraryCitationHref(
  videos: readonly MessageSourceVideo[],
  deletedYoutubeIds: ReadonlySet<string>,
): CitationHref {
  return (citation) => {
    const video =
      citation.source === undefined
        ? videos.length === 1
          ? videos[0]
          : undefined
        : videos.find((candidate) => candidate.index === citation.source);
    if (!video || deletedYoutubeIds.has(video.youtubeId)) return null;
    return `${videoPath(video.youtubeId)}?t=${Math.floor(citation.seconds)}`;
  };
}

/** The YouTube IDs these saved messages cite, each once. */
export function citedYoutubeIds(rows: readonly { sources: MessageSources | null }[]): string[] {
  const ids = rows.flatMap(({ sources }) =>
    sources?.kind === "videos" ? sources.videos.map((video) => video.youtubeId) : [],
  );
  return [...new Set(ids)];
}

/**
 * Whether an answer is the no-match reply. Gemini gives it when the videos
 * it was sent turn out not to answer the question.
 */
export function isNoMatchAnswer(text: string): boolean {
  return text.trimStart().startsWith(NO_MATCH_REPLY);
}

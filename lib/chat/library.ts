import "server-only";
import { buildLibraryContext } from "@/lib/ai/context";
import { librarySystemPrompt } from "@/lib/ai/prompts/library";
import { rewriteQuery } from "@/lib/ai/rewrite";
import type { MessageRole } from "@/lib/chat/types";
import { listLibraryVideos } from "@/lib/db/queries/videos";
import type { MessageSources } from "@/lib/db/types";
import { hybridSearch } from "@/lib/search/hybrid";
import { selectVideos } from "@/lib/search/select-videos";

export type LibraryAnswerSetup =
  /** Nothing matched well enough to answer from; Gemini isn't asked. */
  | { kind: "no_match"; sources: Extract<MessageSources, { kind: "no_match" }> }
  /** Gemini answers from these videos' transcripts, which `instructions` holds. */
  | { kind: "videos"; instructions: string; sources: Extract<MessageSources, { kind: "videos" }> };

/**
 * Finds the videos an "All my videos" question should be answered from. A
 * follow-up is first rewritten into a question that stands on its own; the
 * search uses that, while the chat keeps what was typed. The chosen videos
 * are numbered 1 to 3, in search order, as the answer cites them. Throws
 * when the question can't be embedded; classifyAiError reads why.
 */
export async function prepareLibraryAnswer(
  question: string,
  history: readonly { role: MessageRole; content: string }[],
  { abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<LibraryAnswerSetup> {
  const noMatch = { kind: "no_match", sources: { kind: "no_match", question } } as const;

  const searchQuestion = await rewriteQuery(question, history);
  const outcome = selectVideos(await hybridSearch(searchQuestion, { abortSignal }));
  if (outcome.kind === "no_match") return noMatch;

  const loaded = new Map(
    (await listLibraryVideos(outcome.videos.map((selected) => selected.videoId))).map((video) => [
      video.id,
      video,
    ]),
  );
  // A video deleted since the search is skipped, and the rest renumbered.
  const chosen = outcome.videos.flatMap((selected) => {
    const video = loaded.get(selected.videoId);
    return video ? [{ video, matches: selected.matches }] : [];
  });
  if (chosen.length === 0) return noMatch;

  const numbered = chosen.map((entry, position) => ({ ...entry, index: position + 1 }));
  const context = buildLibraryContext(
    numbered.map(({ index, video, matches }) => ({
      index,
      title: video.title,
      channel: video.channel,
      durationSeconds: video.durationSeconds,
      segments: video.transcriptSegments,
      timestampsEstimated: video.timestampsEstimated,
      matches,
    })),
  );

  return {
    kind: "videos",
    instructions: librarySystemPrompt(context),
    sources: {
      kind: "videos",
      videos: numbered.map(({ index, video, matches }) => ({
        index,
        youtubeId: video.youtubeId,
        title: video.title,
        channel: video.channel,
        timestamps: matches.map((match) => Math.floor(match.startSeconds)),
      })),
    },
  };
}

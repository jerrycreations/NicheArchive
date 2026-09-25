import { formatTranscriptForPrompt } from "@/lib/ai/context";
import { formatDuration } from "@/lib/time";
import type { TranscriptSegment } from "@/lib/transcript/types";

/** What a video chat's instructions need to know about the video. */
export type PromptVideo = {
  title: string;
  channel: string;
  durationSeconds: number;
  segments: readonly TranscriptSegment[];
  /** Pasted text had no timestamps, so they were spread evenly over the video. */
  timestampsEstimated: boolean;
};

const FORMATTING =
  "Write in plain, clear English. Use Markdown only where it helps: short paragraphs, and lists for steps or several points.";

/**
 * Instructions for a chat about one video, with its full timestamped
 * transcript. Gemini answers from the transcript, cites moments as [m:ss],
 * and says so when the transcript doesn't cover something.
 */
export function videoSystemPrompt(video: PromptVideo): string {
  const rules = [
    "- Base your answers on the transcript. It's what was said in the video; you can't see the picture.",
    "- Cite the moments you draw on with the time of their transcript line in square brackets, like [2:15], or [1:02:15] past the first hour. Put one time in each pair of brackets.",
    "- If the transcript doesn't cover something, say so plainly. If you add anything from outside the transcript, label it clearly as general knowledge rather than something from the video.",
    // Gemini's recitation filter cuts off answers that quote well-known text.
    "- Put what's said in your own words, quoting a few words at most. Longer quotes, especially of song lyrics or other well-known text, get answers blocked.",
    "- Transcripts from auto-generated captions can misspell names and lack punctuation. Read past that, and don't mention it unless it matters to the answer.",
    ...(video.timestampsEstimated
      ? [
          "- These timestamps are estimates, spread evenly over text that had none, so cite them as approximate, like \"around [2:15]\".",
        ]
      : []),
    `- ${FORMATTING}`,
  ];

  return [
    "You answer questions about one YouTube video, using its transcript below.",
    "",
    `Video: "${video.title}" by ${video.channel}, ${formatDuration(video.durationSeconds)} long.`,
    "",
    "Rules:",
    ...rules,
    "",
    "Each transcript line starts with the time it's spoken.",
    "<transcript>",
    formatTranscriptForPrompt(video.segments),
    "</transcript>",
  ].join("\n");
}

/** Instructions for a plain Gemini chat, which has no transcripts. */
export function generalSystemPrompt(): string {
  return [
    "You are Gemini, answering questions in NicheArchive, a personal archive of YouTube videos and their transcripts.",
    "This chat has no transcripts attached, so answer from general knowledge.",
    "If someone asks about a particular video in their archive, explain that this chat can't see it, and that a chat started from the video's page can.",
    FORMATTING,
  ].join("\n");
}

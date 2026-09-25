import { NO_MATCH_REPLY } from "@/lib/chat/sources";

/**
 * Instructions for an "All my videos" answer. `context` is the chosen
 * videos' transcripts from buildLibraryContext, numbered Video 1 to 3.
 * Gemini answers only from them and cites each claim as [n @ m:ss]; when
 * they don't answer the question, it says so in the fixed words the chat
 * recognizes, and never falls back on general knowledge.
 */
export function librarySystemPrompt(context: string): string {
  const rules = [
    "- Answer only from these transcripts. Never add general knowledge or anything the videos don't say, even to fill a gap.",
    "- Cite every claim with the video's number and the time of the transcript line it comes from, like [1 @ 2:15], or [2 @ 1:02:15] past the first hour. Put one citation in each pair of brackets.",
    `- If the transcripts don't answer the question, reply with exactly "${NO_MATCH_REPLY}" and nothing else.`,
    "- When the videos disagree or cover different parts of the question, say which video says what.",
    // Gemini's recitation filter cuts off answers that quote well-known text.
    "- Put what's said in your own words, quoting a few words at most. Longer quotes, especially of song lyrics or other well-known text, get answers blocked.",
    "- Transcripts from auto-generated captions can misspell names and lack punctuation. Read past that, and don't mention it unless it matters to the answer.",
    "- Some transcripts are only excerpts around the parts that matched the question, and some have estimated timestamps; each video says so. Cite estimated times as approximate, like \"around [1 @ 2:15]\".",
    "- Write in plain, clear English. Use Markdown only where it helps: short paragraphs, and lists for steps or several points.",
  ];

  return [
    "You answer questions about a personal archive of YouTube videos, using the transcripts of the videos below. They were chosen by searching the archive for the question.",
    "",
    "Rules:",
    ...rules,
    "",
    "Each transcript line starts with the time it's spoken.",
    context,
  ].join("\n");
}

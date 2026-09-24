import { formatTimestamp } from "@/lib/time";

/** How Gemini should transcribe. The video itself goes in the user message. */
export const TRANSCRIBE_INSTRUCTIONS = [
  "You transcribe YouTube videos.",
  "Write down the English speech in the video word for word, in the order it's spoken.",
  "Split it into segments of one or two sentences. Give each segment the time it starts in the video as m:ss, or h:mm:ss past the first hour, and the exact words spoken in it.",
  "Don't summarize, shorten, paraphrase or translate anything.",
  "Don't add speaker names or labels, and don't describe music, sounds or anything shown on screen.",
  "If nobody speaks in the video, return an empty list of segments.",
].join("\n");

/** The request sent with the video. Its length keeps the start times in range. */
export function transcribeRequest(durationSeconds: number): string {
  const length = formatTimestamp(durationSeconds);
  return `Transcribe this video. It's ${length} long, so every start time is between 0:00 and ${length}.`;
}

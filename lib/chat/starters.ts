/**
 * One-click first questions for a chat about a video. The prompt is sent
 * as it is, and shows in the chat as the question.
 */
export const STARTER_PROMPTS = [
  {
    id: "summarize",
    label: "Summarize",
    prompt:
      "Summarize this video in a short paragraph, then list its main points, each with a timestamp.",
  },
  {
    id: "takeaways",
    label: "Key takeaways",
    prompt: "What are the key takeaways from this video? List them, each with a timestamp.",
  },
  {
    id: "outline",
    label: "Outline",
    prompt:
      "Outline this video: its sections in order, each with the timestamp where it starts and a one-line description.",
  },
] as const;

export type StarterPrompt = (typeof STARTER_PROMPTS)[number];

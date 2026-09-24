/** What a chat answers from: one video's transcript, the whole library, or plain Gemini. */
export const CHAT_MODES = ["video", "library", "general"] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

/**
 * Who wrote a message. Postgres sorts enum values in declaration order, so a
 * question sorts before its answer when both are saved with the same time.
 */
export const MESSAGE_ROLES = ["user", "assistant"] as const;

export type MessageRole = (typeof MESSAGE_ROLES)[number];

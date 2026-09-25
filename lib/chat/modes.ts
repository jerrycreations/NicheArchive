import type { ChatMode } from "@/lib/chat/types";

/** How each mode is named wherever a chat shows it. */
export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  video: "One video",
  library: "All my videos",
  general: "Gemini only",
};

/** Shown for a chat that has no title yet. */
export const UNTITLED_CHAT = "Untitled chat";

/** The composer's hint in each mode. */
export const CHAT_MODE_PLACEHOLDERS: Record<ChatMode, string> = {
  video: "Ask about this video",
  library: "Ask about your videos",
  general: "Ask Gemini anything",
};

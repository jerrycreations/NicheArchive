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

/**
 * Library chats need library search, which Step 42 adds. Until then the
 * route refuses them, and the new-chat form says so before anything is sent.
 */
export const LIBRARY_CHAT_UNAVAILABLE =
  "Asking across all your videos isn't ready yet. Choose One video or Gemini only.";

// Hands a first question to the Chats page, which sends it as it opens: for
// example "Ask Gemini instead" after a library search finds nothing.
// sessionStorage keeps it to this tab. It can be missing or throw, as in a
// private window, and then the Chats page just opens empty.
import { z } from "zod";
import { CHAT_MODES } from "@/lib/chat/types";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/constants";
import { youtubeIdSchema } from "@/lib/validation/video";

const KEY = "nichearchive:pending-chat-start";

/** Older than this, a question left behind is dropped rather than sent. */
const MAX_AGE_MS = 60_000;

const pendingStartSchema = z.object({
  mode: z.enum(CHAT_MODES),
  youtubeId: youtubeIdSchema.optional(),
  question: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
  savedAt: z.number(),
});

export type PendingStart = Omit<z.output<typeof pendingStartSchema>, "savedAt">;

/** Leaves a first question for the Chats page to send. */
export function setPendingStart(start: PendingStart, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...start, savedAt: now }));
  } catch {
    // Storage is unavailable; the Chats page opens without the question.
  }
}

/**
 * The first question left for the Chats page, removed as it's read so it's
 * sent once. Null if there's none, it's stale, or it can't be read.
 */
export function takePendingStart(now = Date.now()): PendingStart | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = pendingStartSchema.safeParse(value);
  if (!parsed.success) return null;
  const { savedAt, ...start } = parsed.data;
  if (now - savedAt > MAX_AGE_MS || savedAt > now) return null;
  if (start.mode === "video" && !start.youtubeId) return null;
  return start;
}

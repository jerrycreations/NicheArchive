import { z } from "zod";
import { CHAT_MODES } from "@/lib/chat/types";
import { MAX_CHAT_MESSAGE_CHARS, MAX_CHAT_TITLE_CHARS } from "@/lib/constants";
import { youtubeIdSchema } from "@/lib/validation/video";

/** Chat IDs are UUIDs, created in the browser. */
export const chatIdSchema = z.uuid();

/**
 * The body of POST /api/chat: which chat, and only the new message. The
 * server keeps the history. `mode` and `youtubeId` only matter when the
 * message starts a chat; after that the saved chat's own count.
 */
export const chatRequestSchema = z
  .object({
    chatId: chatIdSchema,
    mode: z.enum(CHAT_MODES),
    youtubeId: youtubeIdSchema.optional(),
    message: z.object({
      id: z.uuid(),
      text: z
        .string()
        .trim()
        .min(1, "Type a message first.")
        .max(
          MAX_CHAT_MESSAGE_CHARS,
          `Keep your message to ${MAX_CHAT_MESSAGE_CHARS.toLocaleString("en-US")} characters or fewer.`,
        ),
    }),
  })
  .refine((body) => body.mode !== "video" || body.youtubeId !== undefined, {
    message: "A chat about a video needs the video's ID.",
    path: ["youtubeId"],
  });

export type ChatRequest = z.output<typeof chatRequestSchema>;

/** A title someone typed: 1 to 80 characters once trimmed. */
export const chatTitleSchema = z
  .string()
  .trim()
  .min(1, "Give the chat a title.")
  .max(MAX_CHAT_TITLE_CHARS, `Keep the title to ${MAX_CHAT_TITLE_CHARS} characters or fewer.`);

/** renameChat's input. */
export const renameChatInputSchema = z.object({
  chatId: chatIdSchema,
  title: chatTitleSchema,
});

export type RenameChatInput = z.input<typeof renameChatInputSchema>;

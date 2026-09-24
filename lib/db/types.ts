import type {
  chats,
  messages,
  transcriptChunks,
  videos,
} from "@/lib/db/schema";

// Row types leave out the generated search_vector columns: nothing reads them
// back, so queries select every other column instead.
export type VideoRow = Omit<typeof videos.$inferSelect, "searchVector">;
export type NewVideo = typeof videos.$inferInsert;

export type TranscriptChunkRow = Omit<
  typeof transcriptChunks.$inferSelect,
  "searchVector"
>;
export type NewTranscriptChunk = typeof transcriptChunks.$inferInsert;

export type ChatRow = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;

export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/** A chat with the video it's about, for lists and headers. Null for library and general chats. */
export type ChatWithVideo = ChatRow & {
  video: Pick<VideoRow, "id" | "youtubeId" | "title" | "channel"> | null;
};

/** One video a library answer drew on. `index` is the n in its `[n @ m:ss]` citations. */
export type MessageSourceVideo = {
  index: number;
  youtubeId: string;
  title: string;
  channel: string;
  /** Start times of the matched chunks, in seconds. */
  timestamps: number[];
};

/**
 * Saved with library answers. Kept even after a cited video is deleted, so
 * old answers can still show where they came from.
 */
export type MessageSources =
  | { kind: "videos"; videos: MessageSourceVideo[] }
  | { kind: "no_match"; question: string };

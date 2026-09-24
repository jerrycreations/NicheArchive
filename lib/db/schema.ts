// Every table enables row-level security with no policies. Supabase's Data API
// exposes the public schema to its anon key, and this shuts it out. The app
// connects as the tables' owner, which bypasses RLS.
import { relations, sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { CHAT_MODES, MESSAGE_ROLES } from "@/lib/chat/types";
import { EMBEDDING_VECTOR_DIMENSIONS } from "@/lib/constants";
import { tsvector } from "@/lib/db/custom-types";
import type { MessageSources } from "@/lib/db/types";
import {
  TRANSCRIPT_SOURCES,
  TRANSCRIPT_STATUSES,
  type TranscriptSegment,
} from "@/lib/transcript/types";

export const transcriptSourceEnum = pgEnum("transcript_source", TRANSCRIPT_SOURCES);
export const transcriptStatusEnum = pgEnum("transcript_status", TRANSCRIPT_STATUSES);
export const chatModeEnum = pgEnum("chat_mode", CHAT_MODES);
export const messageRoleEnum = pgEnum("message_role", MESSAGE_ROLES);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    youtubeId: text("youtube_id").notNull().unique(),
    title: text("title").notNull(),
    channel: text("channel").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    // YouTube's privacyStatus: public, unlisted or private. Gemini can only
    // transcribe public videos.
    privacyStatus: text("privacy_status").notNull(),
    transcriptSegments: jsonb("transcript_segments").$type<TranscriptSegment[]>(),
    transcriptText: text("transcript_text"),
    transcriptSource: transcriptSourceEnum("transcript_source"),
    // Pasted text without timestamps gets evenly spread estimates.
    timestampsEstimated: boolean("timestamps_estimated").notNull().default(false),
    status: transcriptStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    // The processing claim; a claim older than the stall limit reads as failed.
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    // Search index state, kept apart from `status` so a failed index never
    // makes a usable transcript look broken.
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    indexedModel: text("indexed_model"),
    indexError: text("index_error"),
    createdAt: createdAt(),
    // Library search box: title outranks channel, which outranks transcript.
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${videos.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${videos.channel}, '')), 'B') || setweight(to_tsvector('english', coalesce(${videos.transcriptText}, '')), 'C')`,
    ),
  },
  (t) => [
    index("videos_search_vector_idx").using("gin", t.searchVector),
    index("videos_created_at_idx").on(t.createdAt),
    index("videos_published_at_idx").on(t.publishedAt),
  ],
).enableRLS();

export const transcriptChunks = pgTable(
  "transcript_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startSeconds: real("start_seconds").notNull(),
    endSeconds: real("end_seconds").notNull(),
    text: text("text").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_VECTOR_DIMENSIONS }).notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', ${transcriptChunks.text})`,
    ),
  },
  (t) => [
    unique("transcript_chunks_video_id_position_key").on(t.videoId, t.position),
    index("transcript_chunks_search_vector_idx").using("gin", t.searchVector),
    index("transcript_chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
).enableRLS();

export const chats = pgTable(
  "chats",
  {
    // Created in the browser, so the URL can point at the chat before the
    // first reply is saved.
    id: uuid("id").primaryKey(),
    // Null until generated from the first question.
    title: text("title"),
    mode: chatModeEnum("mode").notNull(),
    videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "chats_video_id_matches_mode",
      sql`(${t.mode} = 'video') = (${t.videoId} is not null)`,
    ),
    index("chats_updated_at_idx").on(t.updatedAt),
    index("chats_video_id_idx").on(t.videoId),
  ],
).enableRLS();

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // Library answers only: the videos the answer drew on, or the question
    // that matched nothing.
    sources: jsonb("sources").$type<MessageSources>(),
    createdAt: createdAt(),
  },
  (t) => [index("messages_chat_id_created_at_idx").on(t.chatId, t.createdAt)],
).enableRLS();

export const videosRelations = relations(videos, ({ many }) => ({
  chunks: many(transcriptChunks),
  chats: many(chats),
}));

export const transcriptChunksRelations = relations(transcriptChunks, ({ one }) => ({
  video: one(videos, { fields: [transcriptChunks.videoId], references: [videos.id] }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  video: one(videos, { fields: [chats.videoId], references: [videos.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

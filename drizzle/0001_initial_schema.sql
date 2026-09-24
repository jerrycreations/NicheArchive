CREATE TYPE "public"."chat_mode" AS ENUM('video', 'library', 'general');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('manual_captions', 'auto_captions', 'gemini', 'pasted');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text,
	"mode" "chat_mode" NOT NULL,
	"video_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chats_video_id_matches_mode" CHECK (("chats"."mode" = 'video') = ("chats"."video_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcript_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "transcript_chunks"."text")) STORED,
	CONSTRAINT "transcript_chunks_video_id_position_key" UNIQUE("video_id","position")
);
--> statement-breakpoint
ALTER TABLE "transcript_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"channel" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"privacy_status" text NOT NULL,
	"transcript_segments" jsonb,
	"transcript_text" text,
	"transcript_source" "transcript_source",
	"timestamps_estimated" boolean DEFAULT false NOT NULL,
	"status" "transcript_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"processing_started_at" timestamp with time zone,
	"indexed_at" timestamp with time zone,
	"indexed_model" text,
	"index_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("videos"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("videos"."channel", '')), 'B') || setweight(to_tsvector('english', coalesce("videos"."transcript_text", '')), 'C')) STORED,
	CONSTRAINT "videos_youtube_id_unique" UNIQUE("youtube_id")
);
--> statement-breakpoint
ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_updated_at_idx" ON "chats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chats_video_id_idx" ON "chats" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "messages_chat_id_created_at_idx" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "transcript_chunks_search_vector_idx" ON "transcript_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "transcript_chunks_embedding_idx" ON "transcript_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "videos_search_vector_idx" ON "videos" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "videos_published_at_idx" ON "videos" USING btree ("published_at");
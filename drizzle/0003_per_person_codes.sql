CREATE TABLE "unlock_attempts" (
	"client_key" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unlock_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "chats_updated_at_idx";--> statement-breakpoint
-- Chats made before sign-in came back all belong to the first person in
-- APP_PASSCODES. Added nullable, filled, then made required.
ALTER TABLE "chats" ADD COLUMN "owner" text;--> statement-breakpoint
UPDATE "chats" SET "owner" = 'Jerry';--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "owner" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "chats_owner_updated_at_idx" ON "chats" USING btree ("owner","updated_at");

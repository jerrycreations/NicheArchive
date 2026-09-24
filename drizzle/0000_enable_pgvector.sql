-- Custom SQL migration file, put your code below! --
-- pgvector, which transcript_chunks.embedding needs, so it runs before any table.
-- Supabase keeps extensions in the `extensions` schema, which is already on its
-- search path. Creating the schema is a no-op there and lets this file run on
-- plain Postgres and PGlite too.
create schema if not exists extensions;
--> statement-breakpoint
create extension if not exists vector with schema extensions;

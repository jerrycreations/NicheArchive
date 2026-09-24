# Implementation Plan

Derived from `spec-opus5-5.md`. The steps run in order, and each builds on earlier ones. Each step is small enough for one code-generation pass and changes at most 20 files. The sections follow the spec's build order: caption spike, then library and transcripts, then chat, then indexing and library search, then export and finishing.

## Decisions made while planning

The spec leaves these open. Change any of them here before generating code.

- **Next.js 16 conventions.** `proxy.ts` replaces `middleware.ts`. Page `params` and `searchParams` are Promises and must be awaited. The `lint` script calls ESLint directly because `next lint` was removed.
- **Transcripts are processed after the response, on the server.** Adding a video saves the row as `pending` and returns right away. The client then calls a processing route, which returns `202` and does the work in `after()`, with `maxDuration` set to the Hobby limit. The work keeps running if the tab closes. A timestamp claim keeps two tabs from processing the same video. Processing that stalls past a time limit shows as failed, with a retry button.
- **Helper columns beyond the spec's data model:**
  - `videos.processing_started_at`: the processing claim and stall detection
  - `videos.privacy_status`: the Gemini stage runs only for public videos
  - `videos.timestamps_estimated`: set for pasted text that had no timestamps
  - `videos.indexed_at`, `videos.indexed_model` and `videos.index_error`: the state of the search index, kept apart from transcript status. A failed index never makes a usable transcript look broken.
- **Model names come only from environment variables.** The spec's defaults go in `.env.example` and are never written into code.
- **Two database URLs.** The app runs on Supabase's transaction pooler (port 6543, `prepare: false`, as the spec says). `drizzle-kit` migrations run on the session pooler (port 5432), which handles DDL reliably and works over IPv4.
- **Hybrid search is a SQL function called through Drizzle.** It follows Supabase's Reciprocal Rank Fusion pattern and also returns each chunk's raw cosine similarity. RRF scores only rank results, so they always produce a "top 3" even for unrelated questions. The "I couldn't find this" check therefore uses the similarity value and keyword hits, not the fused score.
- **Chat history lives on the server.** The client sends only the chat ID and the new message. The server loads earlier messages from Postgres. The user and assistant messages are saved together when the answer finishes. If a request fails, nothing is saved and the composer puts the text back for a retry. Chat IDs are UUIDs created in the browser, and the server creates the chat row on the first message.
- **Citation format.** Video chats cite `[m:ss]`. Library chats number the supplied videos and cite `[1 @ m:ss]`. Only bracketed forms become links, so text like "10:30 am" stays plain.
- **Video URLs use the YouTube ID**, for example `/videos/abc123xyz00?t=95`. The `t` parameter seeks the player on load. Links from chats that aren't on a video page use it.
- **Export text is formatted on the server.** The export route returns filename and content pairs with duplicates already resolved. The browser only zips them with JSZip, as the spec requires.
- **"Re-index all" is driven from the browser, one video at a time.** Free-tier embedding limits and function time limits rule out rebuilding everything in one request. Each video records the embedding model it was indexed with, so the run can resume.
- **Captions sit behind one module.** The caption library is used in a single adapter file so it can be swapped. When it returns nothing, the pipeline moves on to the next source. No workaround is added, as the spec's Risks section decides.
- **Thumbnails skip Vercel image optimization** (`unoptimized`). YouTube already serves sized JPEGs, and this keeps the Hobby image quota untouched.
- **Testing.** Each step that adds logic writes Vitest unit tests for it. AI calls are tested with the AI SDK's mock models. The SQL is tested against PGlite with its vector extension. A Playwright smoke test is optional.
- **No passcode (changed 2026-09-24).** Section 4's shared passcode was built and then removed at the user's request, because unlocking got in the way during development. The site is unlisted (`robots.txt` and `noindex` metadata) and open to anyone with its URL. Server actions and route handlers don't check a session, and `APP_PASSCODE`, `AUTH_SECRET` and `SESSION_MAX_AGE_DAYS` are gone. Only the cron route checks a secret (`CRON_SECRET`), and the caption spike route answers `404` in production.

---

## Section 1: Foundation and the caption spike (build order 1)

- [x] Step 1: Scaffold the Next.js project
  - **Task**: Create a Next.js 16 App Router project with TypeScript, Tailwind CSS v4, ESLint and the `@/*` import alias, without a `src/` folder.
    - Root layout: Geist Sans and Geist Mono, `<html lang="en" suppressHydrationWarning>`, and site metadata with the title "NicheArchive".
    - `next.config.ts`: allow the `i.ytimg.com` image host.
    - `app/page.tsx`: redirect to `/library`.
    - `.gitignore`: ignore `.env*` except `.env.example`.
    - `package.json`: an `engines` field for Node 20.9 or later, and a `lint` script that runs `eslint .`.
    - `README.md`: a stub with the project summary and how to run it.
  - **Files**:
    - `package.json`: scripts (`dev`, `build`, `start`, `lint`), engines
    - `tsconfig.json`: strict mode, `@/*` alias
    - `next.config.ts`: `images.remotePatterns` for `i.ytimg.com`
    - `postcss.config.mjs`: Tailwind v4 plugin
    - `eslint.config.mjs`: Next.js flat config
    - `app/layout.tsx`: root layout, fonts, metadata
    - `app/globals.css`: Tailwind import and base layer
    - `app/page.tsx`: redirect to `/library`
    - `.gitignore`: standard ignores plus `.env*` with an exception for `.env.example`
    - `README.md`: overview and local run steps
  - **Step Dependencies**: None
  - **User Instructions**: `create-next-app` won't run in a folder that already holds unrelated files, but it accepts a `docs/` folder. First move `spec.md`, `spec-opus5-5.md`, `plan.md` and this file into `docs/`. Then run `npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"`. Start the app with `npm run dev` and check that it loads at `http://localhost:3000`.

- [x] Step 2: Environment variables and tunable constants
  - **Task**: Add a server-only environment module that checks variables with Zod the first time they're read, not when the module is imported, so `next build` and CI work without secrets. Expose it as a cached `env()` function whose error names every missing or invalid key.
    - Keys: `DATABASE_URL`, `APP_PASSCODE`, `AUTH_SECRET` (at least 32 characters), `YOUTUBE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_CHAT_MODEL`, `GEMINI_REWRITE_MODEL`, `GEMINI_EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` (must equal 768, because the vector column has a fixed size) and `CRON_SECRET`.
    - `DATABASE_MIGRATION_URL` is read only by `drizzle-kit` and stays out of the runtime schema.
    - Add a constants module with a comment on each value:
      - `LONG_VIDEO_WARNING_SECONDS` = 1800
      - `CHUNK_TARGET_SECONDS` = 60, `CHUNK_MAX_SECONDS` = 90
      - `PARAGRAPH_GAP_SECONDS` = 2
      - `SEARCH_MATCH_COUNT` = 30, `TOP_VIDEOS` = 3, `RRF_K` = 50
      - `MIN_SEMANTIC_SIMILARITY`: a placeholder to tune later
      - `CHAT_HISTORY_LIMIT` = 20
      - `MAX_LIBRARY_CONTEXT_CHARS`
      - `SESSION_MAX_AGE_DAYS` = 30
      - `STALE_PROCESSING_MINUTES` = 6
      - `MAX_FILENAME_LENGTH` = 120
    - Write `.env.example` with every key, the spec's default model names and a comment on where each value comes from.
  - **Files**:
    - `lib/env.ts`: Zod schema, cached `env()` accessor, `import "server-only"`
    - `lib/constants.ts`: tunable constants
    - `.env.example`: all keys with defaults or placeholders
    - `README.md`: environment variable table
  - **Step Dependencies**: Step 1
  - **User Instructions**: Run `npm i zod server-only`. Copy `.env.example` to `.env.local`. Leave values blank for now; later steps say where to get each one.
  - **Removed later**: `APP_PASSCODE`, `AUTH_SECRET` and `SESSION_MAX_AGE_DAYS` went with the passcode on 2026-09-24 (see "No passcode" above).

- [x] Step 3: Vitest, YouTube URL parsing and time formatting
  - **Task**: Set up Vitest with the Node environment and path-alias resolution. Then write the parsing and formatting helpers and their tests.
    - `parseYouTubeUrl(input)` returns `{ ok: true, id }` or `{ ok: false, reason }`. It accepts:
      - `watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` and `/live/` URLs
      - `m.`, `music.` and `www.` hosts and `youtube-nocookie.com`
      - input with no protocol, and a bare 11-character ID
      - extra parameters such as `&t=`, `&list=` and `?si=`
    - IDs must match `[A-Za-z0-9_-]{11}`.
    - `buildWatchUrl(id)` and `buildThumbnailUrl(id)` return `https://i.ytimg.com/vi/<id>/hqdefault.jpg`.
    - `parseIso8601Duration` turns `PT1H2M3S` into seconds and `P0D` into 0.
    - `formatDuration` gives `4:07` or `1:02:03`. `formatTimestamp` gives `m:ss` or `h:mm:ss`, and `parseTimestamp` reverses it.
    - Tests cover every accepted format, extra parameters, hostile input (other domains, IDs of the wrong length, `javascript:` URLs) and round-trips between timestamps and seconds.
  - **Files**:
    - `vitest.config.ts`: Node environment, `vite-tsconfig-paths`
    - `lib/youtube/url.ts`: URL parsing and URL builders
    - `lib/time.ts`: duration and timestamp parsing and formatting
    - `lib/youtube/url.test.ts`: URL cases
    - `lib/time.test.ts`: duration and timestamp cases
    - `package.json`: `test` and `test:watch` scripts
  - **Step Dependencies**: Step 1
  - **User Instructions**: Run `npm i -D vitest vite-tsconfig-paths`, then `npm test`, and check that the tests pass.

- [x] Step 4: Transcript types and the caption service
  - **Task**: Define the shared transcript types:
    - `TranscriptSegment`: `{ start: number; duration: number; text: string }`, in seconds
    - `TranscriptSource`: `manual_captions | auto_captions | gemini | pasted`
    - `TranscriptStatus`: `pending | ready | failed`

    Write `fetchCaptions(youtubeId)`, which reads the video's published English caption track through the caption library. It returns `{ ok: true, source, segments }` or `{ ok: false, reason: "no_english_track" | "empty" | "unavailable" | "error", detail }`.
    - Track choice: a manually written English track in any variant (`en`, `en-US`, `en-GB`, and so on) first, then an auto-generated English track. Never use an auto-translated track, because the spec rules out translation.
    - Keep all library-specific code in this adapter so the library can be replaced.
    - `normalizeCaptionCues` is a pure function. It converts milliseconds to seconds when the library returns them, decodes HTML entities (including double-encoded ones such as `&amp;#39;`), drops empty cues, collapses whitespace and sorts by start time.
    - Test the normalizer against fixture library output.
    - Set `runtime = "nodejs"` wherever this module is used.
  - **Files**:
    - `lib/transcript/types.ts`: segment, source and status types
    - `lib/youtube/captions.ts`: `fetchCaptions`, track choice, result mapping
    - `lib/youtube/caption-normalize.ts`: pure cue normalization
    - `lib/youtube/caption-normalize.test.ts`: tests for units, entities, empty cues and ordering
    - `lib/youtube/__fixtures__/caption-cues.json`: sample library output
  - **Step Dependencies**: Step 3
  - **User Instructions**: Run `npm i youtube-transcript`. Before relying on it, check that the package is still maintained and that it can tell manual tracks from auto-generated ones. If it can't, choose a maintained caption library that can. The adapter keeps that swap confined to one file.
  - **Done with `youtube-transcript-plus`**: `youtube-transcript` 1.3.1 has no way to tell manual tracks from auto-generated ones and matches only the exact code `en`. The replacement exposes `kind: "asr"`, but it also picks tracks by language code alone, so `lib/youtube/captions.ts` intercepts the player response through `playerFetch` and leaves only the track it chose.

- [x] Step 5: Caption spike page (measures the main risk)
  - **Task**: Build the throwaway test the spec's build order asks for first.
    - `POST /api/dev/captions` accepts up to 10 YouTube URLs. It runs `fetchCaptions` on them one after another and returns a row for each: the parsed ID, success, source, segment count, the first 200 characters, the failure reason and the time taken in milliseconds.
    - The `/dev/captions` page has a textarea and a plain results table with a total at the bottom ("7 of 10 returned captions").
    - Add a results template in `docs/` for recording the local and deployed numbers side by side.
    - No styling. Step 48 deletes all of this.
  - **Files**:
    - `app/api/dev/captions/route.ts`: batch caption probe with `runtime = "nodejs"`
    - `app/dev/captions/page.tsx`: client page with a textarea and a results table
    - `docs/caption-spike.md`: results template (video kind, local result, deployed result)
  - **Step Dependencies**: Step 4
  - **User Instructions**:
    1. Choose about 10 real videos of mixed kinds: normal uploads, Shorts, a live replay, one with only auto-captions and one with no captions.
    2. Run the page locally, then deploy to Vercel (connect the repo, or run `vercel`). Leave Vercel's default Deployment Protection on so only you can open preview URLs.
    3. Run the same list on the **deployed** URL and record both columns in `docs/caption-spike.md`.

    A low hit rate on Vercel is the case the spec plans for. Gemini (Step 21) and pasting (Step 24) then handle more videos, and nothing else in the plan changes. Keep an eye on Gemini's free allowance of 8 hours of video per day.

---

## Section 2: Design system

- [x] Step 6: shadcn/ui, theme and dark mode
  - **Task**: Set up shadcn/ui with the **neutral** base color and install the components the app needs.
    - Add `next-themes`: `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
    - Add a theme toggle: a dropdown with Light, Dark and System, sun and moon icons, and an accessible label.
    - Mount the Sonner `Toaster` in the root layout.
    - In `globals.css`, add two semantic tokens, `--status-processing` (amber) and `--status-failed` (red), for both themes. These are the only non-neutral colors in the app, as the design brief asks.
    - Prefer thin `border` lines to shadows. Remove any default card shadow.
  - **Files**:
    - `components.json`: shadcn config, neutral base
    - `lib/utils.ts`: `cn` helper
    - `app/globals.css`: neutral light and dark tokens, status tokens, border defaults
    - `app/layout.tsx`: theme provider and `Toaster`
    - `components/theme/theme-provider.tsx`: `next-themes` wrapper
    - `components/theme/theme-toggle.tsx`: Light, Dark and System dropdown
    - `components/ui/*`: generated shadcn components (listed in User Instructions)
  - **Step Dependencies**: Step 1
  - **User Instructions**: Run `npx shadcn@latest init` and choose the **Neutral** base color. Then run `npx shadcn@latest add button input textarea card badge dialog alert-dialog dropdown-menu select tabs skeleton sonner tooltip separator scroll-area sheet command popover toggle-group progress`, followed by `npm i next-themes lucide-react`.
  - **Done with shadcn CLI 4.21**: The CLI no longer asks for a base color. It uses presets instead, so init ran as `npx shadcn@latest init --preset nova --base radix`. `nova` is the neutral preset with Lucide icons and Geist. `radix` keeps Radix primitives and `asChild`, which the Sheet and Command-in-Popover recipes in later steps assume.
    - `cn` now comes from shadcn's `cn` package, which replaces `clsx` and `tailwind-merge`. `lib/utils.ts` re-exports it, and the generated components import it directly.
    - `add` also generated `toggle.tsx` and `input-group.tsx`, which `toggle-group` and `command` depend on. `TooltipProvider` is mounted in the root layout, because Radix tooltips need it.
    - The unused sidebar and chart tokens are removed. The dark sidebar token was blue.
    - The card's `ring-1` edge is now a `border`, so every edge uses the `--border` token. Overlays such as menus and sheets keep their small shadows.
    - Status tokens: amber-800 and red-700 in light, amber-400 and red-400 in dark. Each keeps at least 4.5:1 contrast as text, including over a 15% tint of itself (`bg-status-failed/15 text-status-failed`). They are exposed as `status-processing` and `status-failed` Tailwind colors.
    - The theme provider sets the no-flash script's `type` to `text/plain` on the client, as Next's "Preventing flash before hydration" guide recommends, so React doesn't warn about rendered `<script>` tags. It also sets `disableTransitionOnChange`.

---

## Section 3: Database

- [x] Step 7: Drizzle and the Supabase connection
  - **Task**: Create the Drizzle client over postgres.js with `DATABASE_URL`, the transaction pooler, `prepare: false` and a small pool (`max: 1`) for serverless use.
    - Cache the client on `globalThis` in development so hot reloads don't leak connections.
    - `drizzle.config.ts` loads `.env.local` with `dotenv` and uses `DATABASE_MIGRATION_URL`.
    - Scripts:
      - `db:generate`: `drizzle-kit generate`
      - `db:custom`: `drizzle-kit generate --custom`
      - `db:migrate`: `drizzle-kit migrate`
      - `db:studio`: `drizzle-kit studio`
  - **Files**:
    - `lib/db/index.ts`: postgres.js client, Drizzle instance, dev cache, `server-only`
    - `drizzle.config.ts`: dialect, schema path, `drizzle/` output folder, migration URL
    - `package.json`: database scripts
    - `.env.example`: both URLs, with comments on which pooler each one uses
  - **Step Dependencies**: Step 2
  - **User Instructions**:
    1. Create a free Supabase project. For lower latency, choose the region closest to your Vercel function region (the Vercel default is Washington, D.C., which matches `us-east-1`).
    2. Open **Connect**. Copy the **Transaction pooler** URI (port 6543) into `DATABASE_URL` and the **Session pooler** URI (port 5432) into `DATABASE_MIGRATION_URL`, putting your database password into each.
    3. Run `npm i drizzle-orm postgres dotenv` and `npm i -D drizzle-kit`.
  - **Done with Drizzle 0.45 (stable)**: `drizzle-orm` 0.45.3 and `drizzle-kit` 0.31.11 are npm's `latest` tags; 1.0 is still a release candidate. The 0.x migration layout (`drizzle/0000_*.sql` plus `drizzle/meta/_journal.json`) and `relations()` match this plan.
    - `lib/env.ts` gained `envPick(...keys)`, which validates only the named keys and reports errors the same way. The database client and the Step 10 cron use it, so the keep-alive works as soon as the database URL and `CRON_SECRET` are set, even while the YouTube and Gemini keys are blank. `env()` is unchanged.
    - The client is a lazy `db()` function rather than a module-level instance, because `next build` imports route modules without secrets. It also sets `ssl: "require"`. `.env.example` asks for `?sslmode=require` on `DATABASE_MIGRATION_URL`, since drizzle-kit only reads SSL settings from the URL.
    - `npm audit` reports a moderate esbuild advisory through drizzle-kit's config loader. It concerns esbuild's dev server, which drizzle-kit never starts, and the package is dev-only.

- [x] Step 8: Schema, pgvector and the first migrations
  - **Task**: Before creating any table, add a custom migration containing `create extension if not exists vector with schema extensions;`. The chunk table uses the `vector` type, so this must run first. Then define the schema:
    - **`videos`**:
      - `id`: uuid primary key
      - `youtube_id`: text, unique, not null
      - `title`, `channel`, `duration_seconds`, `published_at`, `privacy_status`
      - `transcript_segments`: jsonb typed as `TranscriptSegment[]`, nullable
      - `transcript_text`: nullable
      - `transcript_source`: enum, nullable
      - `timestamps_estimated`: boolean, default false
      - `status`: enum, default `pending`
      - `error_message`, `processing_started_at`, `indexed_at`, `indexed_model`, `index_error`
      - `created_at`: default `now()`
      - `search_vector`: a generated `tsvector` built from `setweight(to_tsvector('english', title), 'A')`, the same for `channel` with weight `'B'`, and for `transcript_text` with weight `'C'`, each wrapped in `coalesce`
      - Indexes: GIN on `search_vector`, B-tree on `created_at` and `published_at`
    - **`transcript_chunks`**:
      - `id`, `video_id` (foreign key, `on delete cascade`), `position`
      - `start_seconds` and `end_seconds` (real), `text`
      - `embedding`: `vector(768)`, not null
      - `search_vector`: generated from `text`
      - Unique on (`video_id`, `position`)
      - Indexes: GIN on `search_vector`, HNSW on `embedding` with `vector_cosine_ops`
    - **`chats`**:
      - `id`: uuid, supplied by the client
      - `title`: nullable until generated
      - `mode`: enum `video | library | general`
      - `video_id`: nullable foreign key with `on delete cascade`
      - `created_at`, `updated_at`
      - A check constraint: `video_id` is set exactly when `mode = 'video'`
      - Indexes on `updated_at` and `video_id`
    - **`messages`**:
      - `id`, `chat_id` (foreign key, `on delete cascade`)
      - `role`: enum `user | assistant`
      - `content`: text
      - `sources`: jsonb, nullable
      - `created_at`
      - Index on (`chat_id`, `created_at`)

    Use Drizzle's built-in `vector` column and HNSW index support. Declare `tsvector` as a `customType` with `generatedAlwaysAs`. Export the inferred select and insert types, plus the `MessageSources` type: `{ kind: "videos", videos: [...] } | { kind: "no_match", question }`.
  - **Files**:
    - `drizzle/0000_enable_pgvector.sql`: custom migration that creates the extension
    - `lib/db/custom-types.ts`: `tsvector` custom type
    - `lib/db/schema.ts`: enums, tables, relations, indexes, check constraint
    - `lib/db/types.ts`: inferred types, `MessageSources`, `VideoRow`, `ChatWithVideo`
    - `drizzle/0001_*.sql` and `drizzle/meta/*`: generated schema migration
  - **Step Dependencies**: Steps 4, 7
  - **User Instructions**: Run these in order:
    1. `npm run db:custom -- --name=enable_pgvector`, then paste the extension SQL into the generated file (if the code generator hasn't already).
    2. `npm run db:generate`
    3. `npm run db:migrate`

    If the extension step fails, enable **vector** under **Database → Extensions** in Supabase and run the migration again. Check in **Table Editor** that the four tables exist.
  - **Done with row-level security on every table**: each table calls `.enableRLS()` with no policies. Supabase's Data API exposes the `public` schema to the project's anon key, and tables made by migrations start with RLS off. The app connects as the tables' owner, which RLS doesn't restrict.
    - The generated migration is `drizzle/0001_initial_schema.sql` (named with `--name=initial_schema`). Running `db:generate` a second time reports no changes, so the generated columns don't cause a perpetual diff.
    - `0000_enable_pgvector.sql` also runs `create schema if not exists extensions`. That's a no-op on Supabase and lets the same file run on PGlite and plain Postgres. The later migrations use `vector` unqualified, relying on Supabase's search path, which includes `extensions`.
    - `CHAT_MODES` and `MESSAGE_ROLES` live in `lib/chat/types.ts`, following `lib/transcript/types.ts`, so client components can use them without importing Drizzle. The role enum lists `user` first, and Postgres sorts enums in declaration order, so `order by created_at, role` puts a question before its answer when `saveExchange` gives both the same timestamp.
    - `VideoRow` and `TranscriptChunkRow` leave out `searchVector`, so queries should select the other columns rather than `select *`. `MessageSourceVideo` is `{ index, youtubeId, title, channel, timestamps }`, with timestamps in seconds.
    - drizzle-kit resolves the `@/` alias in `lib/db/schema.ts`, so no relative imports were needed.
    - No Supabase project existed yet, so `db:migrate` hasn't run. All three migrations were instead applied to PGlite with pgvector in a throwaway script. It checked the generated columns and weights, the check constraint, the cascades, the unique position, the 768-dimension check, RLS and the `hybrid_search` ranking.

- [x] Step 9: Hybrid search SQL function
  - **Task**: Add a custom migration that creates `hybrid_search(query_text text, query_embedding vector(768), match_count int, full_text_weight float default 1, semantic_weight float default 1, rrf_k int default 50)`. Base it on Supabase's hybrid search example:
    - A `full_text` CTE ranks chunks matching `websearch_to_tsquery('english', query_text)` by `ts_rank_cd`, returning up to `match_count * 2` rows.
    - A `semantic` CTE ranks chunks by `embedding <=> query_embedding`, also up to `match_count * 2` rows.
    - A full outer join merges the two lists by chunk ID. The score is the sum of `weight / (rrf_k + rank)` from each list.
    - It returns `chunk_id`, `video_id`, `position`, `start_seconds`, `end_seconds`, `text`, `similarity` (`1 - cosine distance`, null when the chunk only matched by keyword), `keyword_rank` (null when it only matched by meaning) and `score`, ordered by `score` and limited to `match_count`.
    - Mark the function `stable` and `language sql`.
  - **Files**:
    - `drizzle/0002_hybrid_search.sql`: the function
    - `README.md`: a "Database migrations" section describing the custom-migration workflow
  - **Step Dependencies**: Step 8
  - **User Instructions**: Run `npm run db:custom -- --name=hybrid_search` (so Drizzle records the migration), put the SQL in the generated file, then run `npm run db:migrate`. Check that `hybrid_search` appears under **Database → Functions**.
  - **Done with a pinned search path**: the function has `set search_path = public, extensions`, so `vector` and `<=>` resolve the same way for every caller, and Supabase's mutable-search-path lint stays quiet. Its `query_embedding` parameter is typed `extensions.vector(768)`.
    - `keyword_rank` is the `ts_rank_cd` value, not the list position. Every output is cast to `float8` so the SQL function's return types match. Ties on `score` fall back to `similarity`, so the order is deterministic.
    - Chunks are ranked on meaning with no cutoff, so while the library holds no more than `match_count * 2` chunks, every row has a `similarity`. Rows with a null `similarity` appear only once the semantic list is full, which is why Step 40's threshold checks the value, not whether it's null.

- [x] Step 10: Database keep-alive cron
  - **Task**: Add `GET /api/cron/ping`. It compares the `Authorization` header with `Bearer ${CRON_SECRET}` (Vercel sends this header automatically when `CRON_SECRET` is set), returns `401` if they differ, and otherwise runs `select 1` and returns `{ ok: true, at }`. Use `runtime = "nodejs"` and `dynamic = "force-dynamic"`. Register a daily cron in `vercel.json`, the schedule Hobby allows. This comes early so Supabase doesn't pause during development.
  - **Files**:
    - `app/api/cron/ping/route.ts`: authenticated keep-alive query
    - `vercel.json`: `crons` entry, e.g. `"0 12 * * *"`
  - **Step Dependencies**: Step 7
  - **User Instructions**: Set `CRON_SECRET` to a random string (for example `openssl rand -hex 32`) in `.env.local` and in Vercel's environment variables. After deploying, open **Vercel → Project → Settings → Cron Jobs**, check that the job is listed and run it once.
  - **Done with a constant-time check and a route test**: the route compares SHA-256 digests with `timingSafeEqual` and reads only `CRON_SECRET` and `DATABASE_URL` (through `envPick`). `app/api/cron/ping/route.test.ts` mocks the database and covers a missing header, a wrong secret, a missing `Bearer` prefix, success, and success while unrelated keys are blank. `dynamic = "force-dynamic"` is still valid in Next 16, because `cacheComponents` is off.

---

## Section 4: Access

**Removed on 2026-09-24.** Steps 11 and 12 were built, then deleted at the user's request (see "No passcode" in the decisions above). `proxy.ts`, the `/unlock` page and action, `lib/auth/` and their tests are gone. The no-indexing half of Step 12 stays: `app/robots.ts` and the root layout's `robots` metadata. The spike route's production `404` is back, so the caption spike runs on a preview deployment again. The notes below record what was built.

- [x] Step 11: Passcode session library
  - **Task**: Write the shared-passcode session using Web Crypto only, so it runs in any runtime.
    - `verifyPasscode(input)`: compare HMAC digests of the input and `APP_PASSCODE`, so the comparison takes constant time and lengths don't leak.
    - The session token is `base64url(payload).base64url(signature)`. The payload is `{ iat, pv }`, where `pv` is a short hash of `APP_PASSCODE`, so changing the passcode signs out every device. The signature is HMAC-SHA256 with `AUTH_SECRET`.
    - `createSessionToken()` and `verifySessionToken(token)` check the signature, the `pv` match and a 30-day expiry.
    - Cookie options: name `na_session`, `httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`, 30-day `maxAge`.
    - `requireSession()` reads `cookies()` and throws an `UnauthorizedError`. Every server action and route handler calls it as a second check, because the proxy alone isn't enough protection.
    - Tests: valid token, tampered payload, tampered signature, expired token, passcode changed.
  - **Files**:
    - `lib/auth/session.ts`: token signing and verification, cookie options
    - `lib/auth/passcode.ts`: constant-time passcode check
    - `lib/auth/require-session.ts`: `requireSession`, `UnauthorizedError`, a route-handler helper that returns `401` JSON
    - `lib/auth/session.test.ts`: token cases
  - **Step Dependencies**: Step 2
  - **User Instructions**: Set `APP_PASSCODE` to the passcode you and your friend will share. Set `AUTH_SECRET` to a random string of at least 32 characters (`openssl rand -base64 32`). Add both to `.env.local` now and to Vercel later.
  - **Done with a keyed passcode version and `withSession`**: `pv` is the first 8 bytes of `HMAC(AUTH_SECRET, "passcode-version:" + APP_PASSCODE)`, not a plain hash. The payload is readable by anyone holding the cookie, and a plain hash of a short passcode could be brute-forced offline. Changing either `APP_PASSCODE` or `AUTH_SECRET` signs out every device.
    - HMAC and base64url live in `lib/auth/crypto.ts`, which uses only Web Crypto and `btoa`/`atob` (Node 22 has no `Uint8Array.toBase64`). Every comparison goes through `crypto.subtle.verify`, which is constant-time. Each MAC is labelled (`passcode`, `passcode-version`, `session`), so a MAC made for one purpose never verifies for another.
    - `verifyPasscode` trims its input, because the env schema trims `APP_PASSCODE`. `verifySessionToken` checks the signature before parsing anything, allows 60 seconds of clock drift, and throws, rather than failing open, when either key is missing.
    - The expiry is fixed at 30 days from unlocking; visits don't extend it.
    - The route helper is `withSession(handler)`, used as `export const POST = withSession(async (request) => ...)`. It answers `401` JSON through `unauthorizedResponse()`, and other errors, such as missing env keys, still throw. Server actions call `requireSession()` directly.
    - Besides `session.test.ts`, there are `passcode.test.ts` and `require-session.test.ts`, the latter with `next/headers` mocked.

- [x] Step 12: Proxy, unlock page and no-indexing
  - **Task**: Add `proxy.ts` with a matcher that skips `_next/static`, `_next/image`, `favicon.ico` and other static files.
    - Allow `/unlock` and `/api/cron/*` without a session.
    - Without a valid session, page requests redirect to `/unlock?next=<path>` and `/api/*` requests get `401` JSON.
    - The unlock page is a centered card with one password input. The `unlock` server action checks the passcode, sets the cookie and redirects to `next`. `next` is accepted only if it starts with `/` and not `//`; otherwise it falls back to `/library`.
    - On failure, wait 500 ms and show "That passcode isn't right."
    - Add `app/robots.ts` disallowing everything, and `robots: { index: false }` metadata in the root layout.
    - Call `requireSession()` in the Step 5 spike route.
  - **Files**:
    - `proxy.ts`: session check, redirect and `401` branches, matcher
    - `app/unlock/page.tsx`: unlock screen
    - `components/auth/unlock-form.tsx`: client form with pending and error states
    - `app/actions/auth.ts`: `unlock` action
    - `app/robots.ts`: disallow all
    - `app/layout.tsx`: noindex metadata
    - `app/api/dev/captions/route.ts`: add `requireSession()`
  - **Step Dependencies**: Steps 6, 10, 11
  - **User Instructions**: Restart the dev server. Check that `/library` redirects to `/unlock`, that a wrong passcode shows the error, and that the right one gets through and still works after closing and reopening the browser.
  - **Done with a stricter `next` check and the spike opened to production**: `safeNextPath` (`lib/auth/next-path.ts`) also rejects a leading `/\` (browsers read `/\host` as `//host`), control characters (browsers drop tabs and newlines) and `/unlock` itself. It returns the normalized path, so `/library/../unlock` falls back too. The page sanitizes `next` before putting it in the form, and the action sanitizes it again.
    - Besides `_next/static`, `_next/image` and `favicon.ico`, the matcher skips `robots.txt`, so crawlers can read it, and image extensions. There's no `public/` folder yet.
    - Next 16.3's test helper is still named `unstable_doesMiddlewareMatch`. `proxy.test.ts` uses it for the matcher and calls `proxy()` with a `NextRequest` for the branches. `app/actions/auth.test.ts` covers the 500 ms delay with fake timers and checks the redirect targets.
    - The spike route is wrapped in `withSession`, and its `VERCEL_ENV === "production"` 404 is gone, so `docs/caption-spike.md` now allows any deployment.
    - The error text uses the `destructive` token, which also colours the input's `aria-invalid` ring. React 19 clears the password field after a failed attempt, and the form puts the cursor back in it.
    - `.env.example` and the README advise a long passphrase, since the 500 ms delay is the only brake on guessing. The README has a new "Access" section.
    - `/library` doesn't exist until Step 13, so unlocking with the default `next` lands on a 404 for now. To check the right passcode now, use `/dev/captions`.

---

## Section 5: App shell

- [x] Step 13: Top bar and app layout
  - **Task**: Create the `app/(app)` route group, whose layout holds a sticky top bar and a centered, max-width content area with generous padding.
    - Top bar: the app name (linking to `/library`), Library and Chats links styled for the active route, an "Add video" button and the theme toggle.
    - Below `md`, the two links move into a small menu while "Add video" and the toggle stay visible.
    - "Add video" opens a dialog. Its open state lives in a context provider so any page can open it; the form is added in Step 16.
    - Add placeholder pages for `/library` and `/chats`.
  - **Files**:
    - `app/(app)/layout.tsx`: shell layout
    - `components/layout/top-bar.tsx`: the bar
    - `components/layout/nav-links.tsx`: links with active styling
    - `components/layout/mobile-nav.tsx`: small-screen menu
    - `components/layout/add-video-dialog.tsx`: context provider, `useAddVideoDialog` hook, dialog shell
    - `app/(app)/library/page.tsx`: placeholder
    - `app/(app)/chats/page.tsx`: placeholder
  - **Step Dependencies**: Step 12
  - **User Instructions**: None
  - **Done with shared nav items and a focus-return fix**: `lib/navigation.ts` holds `NAV_ITEMS` and the pure `isActivePath`, which both navs use, so `/chats/<id>` keeps Chats highlighted and `/libraryx` doesn't match `/library`. `lib/navigation.test.ts` covers it. Active links get `aria-current="page"`.
    - The small-screen menu is a `DropdownMenu` with a check on the active link, not a sheet.
    - `add-video-dialog.tsx` also exports `AddVideoButton`. `useAddVideoDialog()` returns `{ open, close }` and throws outside the provider; Step 16's form calls `close()` after `added`. The dialog body is a placeholder line until Step 16.
    - The dialog has no `DialogTrigger`, and Radix then returns focus to a null trigger ref, so closing it would leave focus on `<body>`. `open()` remembers the focused element and `onCloseAutoFocus` puts focus back on it.
    - The shell and the bar use `max-w-7xl`, which leaves room for the 4-column grid (Step 17) and the player-plus-chat layout (Step 27). The bar is `z-40`, below overlays. Below `sm` its gaps shrink to 4px so "NicheArchive" isn't truncated on 320px phones.
    - Unlocking with the default `next` now lands on `/library`. `/unlock` and `/dev/captions` stay outside `(app)`, so they have no top bar.

---

## Section 6: Library and adding videos (build order 2)

- [x] Step 14: YouTube metadata service
  - **Task**: Write `fetchVideoMetadata(youtubeId)`. It calls YouTube Data API v3 `videos.list` with `part=snippet,contentDetails,status` and a `fields` filter to keep the response small. It returns `{ youtubeId, title, channel, durationSeconds, publishedAt, privacyStatus, liveBroadcastContent }`.
    - Map failures to typed errors:
      - empty `items`: `not_found` ("This video is private or has been deleted")
      - `liveBroadcastContent` of `live` or `upcoming`: `live_or_upcoming` ("This stream hasn't finished. Add it after it ends.")
      - `403` with `quotaExceeded` or `dailyLimitExceeded`: `quota_exceeded`
      - `400`/`403` with `keyInvalid` or `forbidden`: `bad_key`
      - fetch failures: `network`
    - Test with mocked `fetch` and fixtures for success, empty items, live, quota and bad key.
  - **Files**:
    - `lib/youtube/metadata.ts`: `fetchVideoMetadata` and response mapping
    - `lib/youtube/errors.ts`: `YouTubeError` kinds and user-facing messages
    - `lib/youtube/metadata.test.ts`: mocked-fetch cases
    - `lib/youtube/__fixtures__/videos-list.json`: sample responses
  - **Step Dependencies**: Step 3
  - **User Instructions**: In Google Cloud Console, create a project, enable **YouTube Data API v3**, create an **API key** under **Credentials**, restrict it to that API, and set it as `YOUTUBE_API_KEY`.
  - **Done with a result instead of throwing, and both error formats**: `fetchVideoMetadata` never throws, like `fetchCaptions`. It returns `{ ok: true, video }` or `{ ok: false, error, detail }`, where `detail` is for the server log.
    - Google now reports an invalid key as a generic `badRequest` in `errors[]` plus `API_KEY_INVALID` in `details[]`, so `classifyApiError` reads reasons from both. `bad_key` also covers a key restricted to other APIs, the API not being enabled, and a blank `YOUTUBE_API_KEY`. The key is read through `envPick`, so adding videos works while the Gemini keys are blank.
    - Two more kinds: `network` (a failed fetch or the 10-second timeout) and `unexpected` (5xx, a body that isn't JSON, or an item that fails the Zod parse).
    - The key goes in the `X-Goog-Api-Key` header rather than `?key=`, so it never shows up in logged URLs. The fixtures also cover the old `keyInvalid` format, a key blocked for this API and a disabled API.
    - Checked live on 2026-09-24 against the YouTube API: a normal video, a made-up ID (`not_found`), a live news stream and a blank key.

- [x] Step 15: Video queries and the add-video action
  - **Task**: Write the video data layer:
    - `getVideoByYoutubeId`, `getVideoById`, `listVideos({ sort })` (sort by `added` or `published`)
    - `insertVideo`: uses `on conflict (youtube_id) do nothing returning`, so a race between two adds becomes `already_exists`
    - `countChatsForVideo`, `deleteVideo`

    Then write the `addVideo({ url, confirmLong })` server action. It returns a discriminated union instead of throwing:
    - `invalid_url`
    - `already_exists { youtubeId, title }`
    - `not_found`, `live_or_upcoming`, `quota_exceeded`, `error { message }`
    - `needs_confirmation { title, durationSeconds }`, returned when the video is over 30 minutes and `confirmLong` is false
    - `added { youtubeId }`

    It saves `privacy_status`, sets status `pending` and revalidates `/library`. It doesn't start transcript processing; the client does that (Step 23).
  - **Files**:
    - `lib/db/queries/videos.ts`: video queries and changes
    - `lib/validation/video.ts`: Zod input schema
    - `lib/actions/result.ts`: shared `ActionResult` helper types
    - `app/actions/videos.ts`: `addVideo`
  - **Step Dependencies**: Steps 8, 11, 14
  - **User Instructions**: None
  - **Done with card-sized list rows and a renamed delete query**: the query is `deleteVideoByYoutubeId`, so it doesn't clash with the `deleteVideo` action, and it returns whether a row was deleted.
    - `listVideos` selects only the card's columns (`VideoListItem` in `lib/db/types.ts`), so the grid never loads transcripts. It adds `chatCount`, a correlated `db().$count(...)` that keeps the grid to one query, for Step 18's dialog. `processingStartedAt` is included for Step 22's `effectiveStatus`.
    - `addVideo` looks for a saved copy before calling YouTube, so re-adding costs no quota. `invalid_url` carries the parser's reason, with messages from `urlFailureMessage` in `lib/youtube/url.ts`, and `added` carries the title for the toast.
    - `bad_key`, `network` and `unexpected` become `error { message }`, and the detail is logged. A thrown database error returns a generic message through `unexpectedError` in `lib/actions/result.ts`, which also defines `ActionError`.
    - `VIDEO_SORTS` lives in `lib/validation/video.ts` for Step 44. `lib/navigation.ts` gained `videoPath(youtubeId)`, and `lib/youtube/url.ts` gained `isVideoId`.
    - The actions check no session (see "No passcode"). The queries also ran against PGlite with the real migrations in a throwaway check: a duplicate insert returns null, both sort orders, chat counts and the cascade delete.

- [x] Step 16: Add-video form and long-video confirmation
  - **Task**: Build the client form used in the top-bar dialog and on the empty library page. It shows each `addVideo` outcome:
    - Inline errors for an invalid URL, a private or deleted video, and live or upcoming streams.
    - `already_exists`: "You already saved this video" with a link to `/videos/<id>`.
    - `needs_confirmation`: a panel saying something like "This video is 47 minutes long. Long videos take longer to transcribe and use more of Gemini's free daily allowance. Add it anyway?", with Add anyway and Cancel buttons. Add anyway submits again with `confirmLong: true`.
    - `quota_exceeded`: "YouTube's daily lookup limit is used up. Try again tomorrow."
    - `added`: close the dialog, call `router.refresh()`, and show a toast with an "Open" link.

    Keep the URL in the field after a failure and disable the button while waiting.
  - **Files**:
    - `components/library/add-video-form.tsx`: form, outcome handling, pending state
    - `components/library/add-video-outcome.tsx`: messages for each outcome and the confirmation panel
    - `components/layout/add-video-dialog.tsx`: mount the form
  - **Step Dependencies**: Steps 13, 15
  - **User Instructions**: None
  - **Done without `router.refresh()` and with nested transitions**: in Next 16, a server action that calls `revalidatePath` sends the re-rendered current route in the same response, so a refresh after `added` would be a second round trip.
    - React 19 doesn't count updates made after an `await` as part of the surrounding transition, so they commit before `isPending` turns false. The form wraps them in a second `startTransition`. Without it, the confirmation panel mounted with its buttons still disabled, and Add anyway couldn't take focus.
    - The input is controlled, with `type="text"` and `inputMode="url"`, because `type="url"` rejects links without `https://` and bare IDs. The browser runs `parseYouTubeUrl` first for instant feedback, and the server checks again. The field is read-only while a request is in flight.
    - `onDone` closes the dialog after an add and when the "Open it" link for a saved video is followed. The dialog lives in the layout, so it would otherwise stay open across navigation. Add anyway gets focus and is described by the message; Cancel puts focus back in the field.
    - `formatDurationWords` in `lib/time.ts` gives "1 hour 16 minutes". The dialog is `sm:max-w-md` to fit long links.

- [x] Step 17: Library page, grid and cards
  - **Task**: Build the library page as a server component that lists videos newest first.
    - Each card shows the thumbnail from `buildThumbnailUrl` (`next/image` with `unoptimized` and lazy loading, `aspect-video object-cover`), the duration over the thumbnail, the title limited to two lines, the channel, the date added and a transcript status badge.
    - Badge: plain neutral "Transcript ready", or colored with the Step 6 tokens for "Processing" and "Failed".
    - The whole card links to `/videos/<youtubeId>`. A small overflow button on the card is added in Step 18.
    - Empty library: a friendly empty state with the add form inline.
    - `loading.tsx`: a skeleton grid shaped like the real cards.
  - **Files**:
    - `app/(app)/library/page.tsx`: data loading and rendering
    - `app/(app)/library/loading.tsx`: skeleton grid
    - `components/library/video-grid.tsx`: responsive grid (1, 2, 3 and 4 columns)
    - `components/library/video-card.tsx`: card
    - `components/library/transcript-status-badge.tsx`: badge
    - `components/library/empty-library.tsx`: empty state with the inline form
    - `lib/format/date.ts`: date formatting helpers
  - **Step Dependencies**: Steps 15, 16
  - **User Instructions**: None
  - **Done with `connection()`, `LocalDate` and a stretched link**: the page calls `await connection()`. With `cacheComponents` off, database reads don't make a route dynamic, so without it `next build` would render the library once, at build time.
    - Dates go through `components/common/local-date.tsx`. The server and hydration render UTC, then `useSyncExternalStore` re-renders in the viewer's time zone, so a video added on a US evening doesn't show tomorrow's date. `lib/format/date.ts` has `formatDate(value, timeZone?)`.
    - The title's link stretches over the card (`after:absolute after:inset-0`) instead of wrapping it, so Step 18's menu button isn't nested inside a link. The card shows an outline while its link has keyboard focus.
    - `VideoGridSkeleton` and `VideoCardSkeleton` share the real grid and card shapes. Checked live: 1, 2, 3 and 4 columns at 438, 700, 1100 and 1400 px wide, in both themes.

- [x] Step 18: Delete a video
  - **Task**: Add the `deleteVideo(youtubeId)` action. It relies on the cascading foreign keys, so the transcript, chunks, video chats and their messages go in one statement. It then revalidates `/library`.
    - The confirm dialog names the video and lists what will be removed: "its transcript, its search index and N chats about it". The number comes from `countChatsForVideo`.
    - After deleting, go to `/library` if the user is on that video's page.
    - Show a toast on failure.
    - Add a card overflow menu with Delete. The same menu component is used on the video page in Step 27.
    - Library chat answers that cited the video keep their saved sources; Step 43 shows those as "Video deleted".
  - **Files**:
    - `app/actions/videos.ts`: `deleteVideo`
    - `components/video/delete-video-dialog.tsx`: confirm dialog with pending state
    - `components/video/video-actions-menu.tsx`: overflow menu
    - `components/library/video-card.tsx`: add the menu
  - **Step Dependencies**: Step 17
  - **User Instructions**: None
  - **Done with the chat count from the list and a focus fix**: the dialog's chat count comes from `listVideos` rather than a separate `countChatsForVideo` call, which Step 27's video page will make. The wording drops the chats clause when there are none and says "1 chat" for one.
    - A video that's already gone counts as deleted. The dialog stays open while deleting and after a failure, which also shows a toast.
    - Radix has no trigger to return focus to, so `onCloseAutoFocus` focuses the ⋮ button, as in Step 13. After a delete from the library the card is gone, so focus falls back to the page.
    - On the video's own page the dialog replaces the URL with `/library` inside a transition, so the page's not-found render shouldn't flash. Re-check this in Step 27.
    - The dialog is rendered beside the dropdown menu rather than inside it. Checked live that the page still takes clicks after it closes, and that Escape returns focus to the ⋮ button.

---

## Section 7: Transcripts

- [x] Step 19: Transcript text helpers and paste parsing
  - **Task**: Write the pure text layer:
    - `segmentsToParagraphs(segments)`: starts a new paragraph when the gap between the end of one cue and the start of the next is at least `PARAGRAPH_GAP_SECONDS`. When a cue has no duration, use the gap between start times instead.
    - `segmentsToPlainText`: joins paragraphs with blank lines.
    - `cleanCueText`: collapses whitespace and drops cues that are only bracketed noise, such as `[Music]` or `[Applause]`.
    - `parsePastedTranscript(text, durationSeconds)` detects these layouts:
      - timestamps at the start of a line (`0:00 text`, `[1:23] text`, `(01:02:03) text`)
      - a timestamp on its own line with the text on the next line
      - no timestamps at all

      Timed input becomes segments whose durations come from the next start time. Text without timestamps is split into sentence groups, with start times spread evenly across the video, and the result carries `timestampsEstimated: true`. Input under about 20 words is rejected with a reason.
    - Tests: the 2-second paragraph rule, noise removal, all three paste layouts and rejection.
  - **Files**:
    - `lib/transcript/text.ts`: paragraphs, plain text, cue cleanup
    - `lib/transcript/parse-pasted.ts`: paste parser
    - `lib/transcript/text.test.ts`: paragraph and cleanup cases
    - `lib/transcript/parse-pasted.test.ts`: paste layout cases
  - **Step Dependencies**: Steps 3, 4
  - **User Instructions**: None
  - **Done with a paragraph length cap and shared timing helpers**: at the user's choice, `segmentsToParagraphs` keeps the 2-second pause rule and also ends a paragraph at the first sentence end after `PARAGRAPH_MAX_SECONDS` (60), or at the next cue after twice that. Gemini and pasted segments run on to the next start, so they never pause, and overlapping auto-captions rarely do. Without the cap they'd copy and export as one long paragraph.
    - `cleanCueText` returns null for a cue with nothing spoken in it: square-bracket labels of any length, parenthesized ones up to 20 characters (a longer aside in parentheses can be speech), music notes and punctuation. `cleanSegments` applies it and keeps the timings.
    - `text.ts` also has `durationsFromStarts`, `estimateSpeechSeconds` (2.5 words a second), `countWords` and `endsSentence`, which the paste parser and Step 21's validator share. A last segment lasts as long as its words take to say, cut off at the end of the video.
    - Paste layouts: a paste counts as timed when at least 2 lines start with a timestamp and those make up a quarter of its lines, so prose such as "10:30 is when…" stays plain text. A timestamp without brackets must be followed by a space, dash or colon, so "1:23pm" isn't one. Each timestamp's segment takes the rest of its line and the lines below it, which covers both timed layouts. Lines before the first timestamp, such as a title, are dropped.
    - Untimed text is cut into groups that close at the first sentence end after 25 words, or at 60 words without punctuation, and each group is placed along the video by its word position. A paste with fewer than 20 words left after noise removal is rejected.
    - `MAX_PASTED_TRANSCRIPT_CHARS` (500,000) in `lib/constants.ts` keeps a paste under Next's 1 MB limit on a server action's request.

- [x] Step 20: Gemini provider, models and AI errors
  - **Task**: Configure `createGoogleGenerativeAI({ apiKey })` from `@ai-sdk/google`.
    - `models.ts` exposes `chatModel()`, `rewriteModel()` and `embeddingModel()`, reading the model names from `env()`.
    - `errors.ts` has `classifyAiError(error)`, which returns one of:
      - `rate_limited { retryAfterSeconds? }` for HTTP 429 or `RESOURCE_EXHAUSTED`
      - `model_not_found`
      - `bad_key`
      - `blocked` (safety)
      - `unsupported_input`
      - `unknown`

      `aiErrorMessage(kind)` returns the user-facing text. `rate_limited` reads: "Gemini's free limit was reached. Try again in a minute."
    - Test the classifier with constructed `APICallError` instances.
  - **Files**:
    - `lib/ai/provider.ts`: provider instance, `server-only`
    - `lib/ai/models.ts`: model accessors
    - `lib/ai/errors.ts`: classifier and messages
    - `lib/ai/errors.test.ts`: classifier cases
  - **Step Dependencies**: Step 2
  - **User Instructions**: Create a free API key in Google AI Studio and set it as `GOOGLE_GENERATIVE_AI_API_KEY`. Run `npm i ai @ai-sdk/google @ai-sdk/react`. Check the three model names in `.env.local` against AI Studio's current model list, because an outdated name only fails when it's called.
  - **Done with AI SDK 7 and config errors**: the installed versions are `ai` 7.0.114, `@ai-sdk/google` 4.0.80 and `@ai-sdk/react` 4.0.117. Version 7 renames several things this plan assumed:
    - `createGoogle`; the old `createGoogleGenerativeAI` is still exported as an alias.
    - `instructions` instead of `system`.
    - `generateText` with `output: Output.object({ schema })`, read from `result.output`. `generateObject` is deprecated.
    - `google.embedding(id)`.
    - `MockLanguageModelV4` and `MockEmbeddingModelV4` from `ai/test`.

    The provider's model list already includes `gemini-3.8-flash` and `gemini-3.5-flash-lite`.
    - The provider and the model accessors read only their own keys through `envPick`, so the rest of the app works while the Gemini settings are blank. The provider is created on first use, like `db()`. A blank key or model name throws `AiConfigError`, which classifies as `bad_key` or `model_not_found`.
    - `classifyAiError` looks through `RetryError` to the last attempt. It takes the retry delay from a `Retry-After` header or Google's `RetryInfo.retryDelay`. It checks API-key reasons before the generic 400, since an invalid key arrives as a 400 `INVALID_ARGUMENT`, and sorts other 400 and 403 refusals into `unsupported_input`.
    - Google's error-body readers moved from `lib/youtube/errors.ts` to `lib/google/error-body.ts`, which also gained `errorStatus`, `errorMessage`, `retryDelaySeconds` and `API_KEY_REASONS`. The YouTube and Gemini classifiers both use it.

- [x] Step 21: Gemini transcription
  - **Task**: Write `transcribeWithGemini({ youtubeId, durationSeconds })`. Call the chat model with the watch URL as a video file part and ask for structured output with a Zod schema: `{ segments: [{ start: "m:ss", text }] }`.
    - Prompt (kept in its own file): a word-for-word English transcript in segments of one or two sentences. Don't summarize, add speaker labels or describe sounds. Use temperature 0.
    - Ask for low media resolution through provider options if the installed provider supports it. Transcription only needs the audio, and this cuts token use a lot.
    - `validateGeminiSegments(raw, durationSeconds)` is pure. It parses the timestamps and sorts them, drops segments that start after the video ends (with 5 seconds of slack), derives each duration from the next start, and rejects the result if nothing is left or more than 20% was dropped.
    - Return `{ ok: true, source: "gemini", segments }` or a typed failure.
    - Test the validator directly. Test the transcription call with an AI SDK mock model.
  - **Files**:
    - `lib/ai/transcribe.ts`: the Gemini call
    - `lib/ai/prompts/transcribe.ts`: transcription prompt
    - `lib/ai/transcribe-validate.ts`: segment validation
    - `lib/ai/transcribe-validate.test.ts`: validation cases
    - `lib/ai/transcribe.test.ts`: mock-model success and failure
  - **Step Dependencies**: Steps 3, 4, 20
  - **User Instructions**: None
  - **Done without temperature 0, and with the link as a URL**: temperature stays at the default. Google's Gemini 3 docs strongly recommend keeping it at 1.0 and warn that lower values can cause looping, which would ruin a long transcript.
    - The watch link goes in as a `URL` object, because in AI SDK 7 a bare string in a file part is read as base64 data. The Google provider passes YouTube watch URLs to Gemini as `fileData` rather than downloading them. Low media resolution goes through `providerOptions.google.mediaResolution`; the provider has no fps option for cutting video tokens further.
    - A 240-second abort signal leaves room in the processing route's 300 seconds for the caption attempt and the database writes.
    - Besides the AI error kinds, a failure can be `invalid_output` (not JSON, or the wrong shape), `too_long` (cut off at the output limit), `timeout`, `no_speech` or `bad_timestamps`. Each has a message for the user and a detail for the log. A safety block comes back with no text, so `finishReason` is checked before reading `output`.
    - The mock-model test gives the model `supportedUrls`, so the SDK doesn't try to download the watch page, and stubs `fetch` to fail.
    - Not run against Gemini yet, because `GOOGLE_GENERATIVE_AI_API_KEY` is blank. Without the key, the Gemini stage fails with the bad-key message.

- [x] Step 22: Transcript pipeline and processing route
  - **Task**: `resolveTranscript(video)` tries three stages in order and records why each one failed or was skipped:
    1. Captions (`manual_captions` or `auto_captions`).
    2. Gemini (`gemini`), only when `privacy_status` is `public`. Otherwise it's skipped with "Gemini can only transcribe public videos."
    3. If both fail, it returns `needs_manual` with the stage reasons.

    `processVideoTranscript(videoId)` works like this:
    - It first **claims** the video with a conditional update that sets `processing_started_at = now()`, `status = 'pending'` and `error_message = null`. The update only applies when the status is `pending` or `failed` and the claim is null or older than `STALE_PROCESSING_MINUTES`. If the claim fails, it returns `already_running`.
    - On success it writes the segments, the plain text (from Step 19), the source and `ready`, and clears the claim.
    - On `needs_manual` it writes `failed` and an `error_message` listing each stage's reason.

    `effectiveStatus(video, now)` is pure. It reports `pending` rows with a claim older than the stall limit as `failed` ("Took too long"). Add tests for it.

    `POST /api/transcripts/process` takes `{ youtubeId }`:
    - It uses `runtime = "nodejs"` and `maxDuration = 300` (check this against Vercel's current Hobby limit).
    - It returns `200` when the video is already `ready`. Otherwise it returns `202` and runs `processVideoTranscript` in `after()`.
    - Retries use the same route; the claim makes repeat calls harmless.
  - **Files**:
    - `lib/transcript/pipeline.ts`: `resolveTranscript`, `processVideoTranscript`
    - `lib/transcript/status.ts`: `effectiveStatus`
    - `lib/transcript/status.test.ts`: stall and status cases
    - `app/api/transcripts/process/route.ts`: processing endpoint
    - `lib/db/queries/videos.ts`: `claimForProcessing`, `writeTranscript`, `markTranscriptFailed`
  - **Step Dependencies**: Steps 15, 19, 21
  - **User Instructions**: None
  - **Done with the claim taken before the response, and fenced writes**: the route claims the video before answering, then runs the stages in `after()`. If the claim ran inside `after()`, a Retry followed by a refresh could still show the video as failed, with nothing watching it. The route answers `started` or `already_running` with 202, `ready` with 200 and `not_found` with 404.
    - The claim time is a fencing token. `writeTranscript` and `markTranscriptFailed` only apply while `processing_started_at` still equals it, and both clear it. A paste writes without one, so a run that's still going can't overwrite pasted text, and a stalled run can't overwrite a newer retry. The claim time comes from the JavaScript clock rather than `now()`, because Postgres keeps microseconds and a JS `Date` doesn't, so a database value wouldn't compare equal after the round trip.
    - Failing clears the claim, so Retry can start at once. A crash marks the video failed with a generic reason; if even that write fails, the 6-minute stall rule shows it as failed.
    - `error_message` holds one line per stage, `Captions: …` and `Gemini: …`. `formatStageReasons` writes it and `parseStageReasons` reads it, both in `lib/transcript/status.ts`, which client components can import. Captions with only sound labels, such as Keyboard Cat's `[Applause] [Music]`, move on to Gemini.
    - `maxDuration = 300` matches Vercel Hobby's limit with Fluid compute (Vercel docs, 2026-08). There's no session check (see "No passcode").
    - Besides `status.test.ts`, there are `pipeline.test.ts` and a route test with `after` mocked. A throwaway PGlite check ran the real queries on the migrations: a claim taken only once and round-tripping to the millisecond, the stall boundary, a ready video never claimed, a stalled run's write dropped after a retry, a paste surviving a late run, and effective statuses.

- [x] Step 23: Status polling and retry
  - **Task**: `GET /api/videos/status?ids=a,b,c` returns `{ youtubeId, status (effective), source, errorMessage }[]`.
    - `TranscriptStatusWatcher` is a client component that receives the IDs of pending videos.
      - For any pending video with no claim, it calls the process route once. This covers a tab closed right after adding.
      - It polls every 3 seconds, slowing to 10 seconds, stops when every video has finished, and calls `router.refresh()` when something changes.
    - The add form calls the process route when it gets `added`.
    - `RetryTranscriptButton` calls the process route and then refreshes.
    - Mount the watcher on the library page. Failed cards show the retry button.
  - **Files**:
    - `app/api/videos/status/route.ts`: batch status
    - `lib/transcript/client.ts`: client fetch helpers for processing and status
    - `components/transcript/status-watcher.tsx`: polling component
    - `components/transcript/retry-button.tsx`: retry button with pending state
    - `components/library/add-video-form.tsx`: start processing after a successful add
    - `components/library/video-card.tsx`: retry on failed cards
    - `app/(app)/library/page.tsx`: mount the watcher
  - **Step Dependencies**: Steps 16, 17, 22
  - **User Instructions**: None
  - **Done with effective statuses from the query**: `listVideos` returns effective statuses, computed with `new Date()` in the query function, because the React Compiler's lint flags `Date` in render. It keeps `processingStartedAt`, so the watcher can tell which pending videos have started.
    - `TranscriptStatusWatcher` takes `{ youtubeId, started }[]`. It remembers across refreshes which videos it has started, and restarts its polling only when the set of IDs changes. A video missing from the status response counts as finished. With no passcode, there's no 401 case.
    - `requestTranscript` and `fetchTranscriptStatuses` in `lib/transcript/client.ts` never throw; they return null on failure. The add form calls `requestTranscript` without waiting, so right after an add both the form and the watcher may call the route. The claim turns the second call into `already_running`.
    - `RetryTranscriptButton` refreshes in a second transition after its await, so "Retrying…" stays up until the refresh lands. The card's Retry sits beside the Failed badge with `relative z-10`, above the stretched title link.
    - The status route takes up to 100 IDs, ignores repeats and answers with `Cache-Control: no-store`.
    - Checked live against Supabase in a production build:
      - A captioned video went from Processing to ready.
      - A video whose captions were only sound labels failed with both stages' reasons, and Retry ran it again.
      - A pending video with no claim was started by the watcher after a reload.
      - A claim left 7 minutes old showed as Failed, and Retry took it over.

- [x] Step 24: Manual paste fallback
  - **Task**: Build the failed-transcript panel, which Step 27 places on the video page.
    - It explains that automatic transcription didn't work, lists each stage's reason from `error_message`, and has a Retry button.
    - An "Open in youtubetotranscript.com" link opens that site in a new tab (`target="_blank" rel="noopener noreferrer"`). Build the link in `lib/youtube/links.ts`: use the site's page for this video if the URL pattern is confirmed, otherwise its home page. The app never sends requests to that site; the user copies the text by hand.
    - A textarea accepts the pasted transcript. The `savePastedTranscript({ youtubeId, text })` action:
      - validates with Zod
      - runs `parsePastedTranscript`
      - writes the segments, the plain text, source `pasted`, `timestamps_estimated` and status `ready`
      - revalidates the page
    - Parse errors ("That doesn't look like a transcript") appear inline and the textarea keeps its text.
  - **Files**:
    - `components/video/transcript-failed.tsx`: explanation, reasons, retry, external link
    - `components/video/paste-transcript-form.tsx`: textarea and submit
    - `app/actions/transcripts.ts`: `savePastedTranscript`
    - `lib/validation/transcript.ts`: Zod schema
    - `lib/youtube/links.ts`: YouTube watch link and youtubetotranscript.com link builders
  - **Step Dependencies**: Steps 19, 22
  - **User Instructions**: Open youtubetotranscript.com once with any video and note the URL it uses, so `lib/youtube/links.ts` can link straight to the right page.
  - **Done with the site's home page and the video's link shown to copy**: the site's URL for a single video isn't confirmed yet, so `lib/youtube/links.ts` exports `TRANSCRIPT_SITE_URL`, its home page, and the panel shows the video's watch link to paste there. The watch-link builder stays `buildWatchUrl` in `lib/youtube/url.ts`.
    - `savePastedTranscript` returns `saved`, `invalid_transcript { message }` or an `ActionError`. It writes without a claim and revalidates `/library` and the video's path. In Next 16 that re-renders the current page in the same response, so the form doesn't refresh. The form checks for an empty or oversized paste itself, because a paste over 1 MB would never reach the server.
    - Checked live on a temporary page, since Step 27 mounts the panel: the reasons, Retry, the link's `target` and `rel`, the empty and too-short errors (the text is kept and focus returns to the box), and a timed paste saved as ready.

---

## Section 8: Video page

- [ ] Step 25: Embedded player and seeking
  - **Task**: Load the YouTube IFrame Player API once per page, as a shared promise.
    - `YouTubePlayer` creates the player (host `https://www.youtube-nocookie.com`), accepts a `startSeconds` value and exposes `seekTo(seconds)`, which seeks and plays.
    - `PlayerProvider` puts `seekTo` and a ready flag in context. `usePlayer()` returns a harmless no-op outside the provider.
    - If the API hasn't loaded within 10 seconds, fall back to a plain iframe with `?start=`. In that case `seekTo` reloads the iframe at the new start time.
    - Player errors 101 and 150 (embedding disabled) show "This video can't be played here" with an "Open on YouTube" link.
    - Remove the player on unmount.
  - **Files**:
    - `lib/player/load-iframe-api.ts`: shared script loader
    - `components/player/youtube-player.tsx`: player, fallback, error state
    - `components/player/player-provider.tsx`: context
    - `lib/player/use-player.ts`: hook with a no-op default
  - **Step Dependencies**: Step 13
  - **User Instructions**: None

- [ ] Step 26: Transcript viewer
  - **Task**: Render the transcript as a scrollable list.
    - `groupDisplayLines(segments)` is pure and merges short cues into lines of about 10 to 20 seconds so the list is easier to read. Test it.
    - Each line starts with a timestamp button that calls `seekTo`. Estimated timestamps show a leading `~` and a note: "Timestamps are approximate because the pasted text had none."
    - Header: a source label ("From the video's captions", "From auto-generated captions", "Transcribed by Gemini" or "Pasted manually") and a copy button. The copy button copies `transcript_text` without timestamps and confirms with a toast.
    - While processing, show a skeleton with a "Getting the transcript…" indicator.
  - **Files**:
    - `components/transcript/transcript-viewer.tsx`: list and header
    - `components/transcript/transcript-line.tsx`: one line with its timestamp button
    - `components/transcript/copy-transcript-button.tsx`: clipboard copy
    - `components/transcript/source-label.tsx`: source wording
    - `components/transcript/transcript-processing.tsx`: processing state
    - `lib/transcript/display-lines.ts`: line grouping
    - `lib/transcript/display-lines.test.ts`: grouping cases
  - **Step Dependencies**: Steps 19, 25
  - **User Instructions**: None

- [ ] Step 27: Video page layout
  - **Task**: `app/(app)/videos/[youtubeId]/page.tsx` loads the video and calls `notFound()` if it's missing. It reads `?t=` as the player's start time.
    - Header: title, channel, publish date, duration, an "Open on YouTube" link and the actions menu from Step 18.
    - Desktop (`lg` and up): a two-column grid. The left column holds the player and the transcript panel; the right column (about 400px) holds the chat. The chat is a placeholder until Step 32.
    - Mobile: the player, then tabs for **Transcript** and **Chat**.
    - The transcript panel shows the processing state, the failed state (Step 24) or the viewer (Step 26), depending on `effectiveStatus`.
    - Mount the status watcher while the video is pending.
    - Add `loading.tsx` and `not-found.tsx`.
  - **Files**:
    - `app/(app)/videos/[youtubeId]/page.tsx`: data loading and composition
    - `app/(app)/videos/[youtubeId]/loading.tsx`: skeleton
    - `app/(app)/videos/[youtubeId]/not-found.tsx`: missing-video message
    - `components/video/video-page-layout.tsx`: desktop columns and mobile tabs
    - `components/video/video-meta.tsx`: header details
    - `components/video/transcript-panel.tsx`: switches between the three states
  - **Step Dependencies**: Steps 18, 23, 24, 26
  - **User Instructions**: None

---

## Section 9: Chat (build order 3)

- [ ] Step 28: Chat persistence and titles
  - **Task**: Chat queries:
    - `createChatIfMissing(id, mode, videoId)`: an upsert that fails if an existing row has a different mode or video
    - `getChat(id)`: with the joined video
    - `listChats()`: newest `updated_at` first, with the joined video's ID, title and YouTube ID
    - `listChatsForVideo(videoId)`, `renameChat`, `deleteChat`
    - `setChatTitleIfEmpty`

    Message queries:
    - `listMessages(chatId)`
    - `saveExchange(chatId, userMessage, assistantMessage)`: inserts both messages and updates `chats.updated_at` in one transaction

    Titles:
    - `generateChatTitle(question)` asks the rewrite model for a title of 60 characters or fewer.
    - `fallbackTitle(question)` is pure: it trims at a word boundary and adds an ellipsis. It's used when the model call fails, because a title should never break a chat.

    Add the `renameChat` and `deleteChat` actions, validated with Zod. Test `fallbackTitle`.
  - **Files**:
    - `lib/db/queries/chats.ts`: chat queries
    - `lib/db/queries/messages.ts`: message queries and `saveExchange`
    - `lib/ai/title.ts`: `generateChatTitle`, `fallbackTitle`
    - `lib/ai/prompts/title.ts`: title prompt
    - `lib/ai/title.test.ts`: fallback cases
    - `app/actions/chats.ts`: `renameChat`, `deleteChat`
    - `lib/validation/chat.ts`: Zod schemas
  - **Step Dependencies**: Steps 8, 20
  - **User Instructions**: None

- [ ] Step 29: Prompt and context builders
  - **Task**: Write the pure prompt-building functions.
    - `formatTranscriptForPrompt(segments)`: lines of the form `[m:ss] text`, merging cues into lines of about 15 seconds to save tokens.
    - `videoSystemPrompt(video)`: title, channel, the full timestamped transcript and these rules:
      - base answers on the transcript
      - cite moments as `[m:ss]`
      - say clearly when something isn't in the transcript, and label any outside knowledge as such
    - `generalSystemPrompt()`: a short prompt with no transcripts.
    - `trimHistory(messages, CHAT_HISTORY_LIMIT)`: keeps the most recent turns and always starts on a user message.
    - `toModelMessages(rows)`: turns database rows into AI SDK model messages.
    - `STARTER_PROMPTS`: Summarize, Key takeaways and Outline, each with its full prompt text.
    - Test the formatting, trimming and message conversion.
  - **Files**:
    - `lib/ai/prompts/chat.ts`: video and general system prompts
    - `lib/ai/context.ts`: transcript formatting, history trimming, message conversion
    - `lib/ai/context.test.ts`: builder cases
    - `lib/chat/starters.ts`: starter prompts
  - **Step Dependencies**: Steps 3, 4
  - **User Instructions**: None

- [ ] Step 30: Chat API route for video and general modes
  - **Task**: `POST /api/chat` takes `{ chatId, mode, youtubeId?, message: { id, text } }`, validated with Zod. It sets `maxDuration = 60`.
    - It calls `createChatIfMissing`. For an existing chat, the mode stored in the database wins over what the client sent.
    - Video mode: load the video. If its transcript isn't `ready`, return `409` with "This video's transcript isn't ready yet."
    - Load the history from the database, trim it and add the new message.
    - Call `streamText` with the mode's system prompt and return `toUIMessageStreamResponse()`.
    - When the stream finishes, call `saveExchange`. If the chat has no title, run `generateChatTitle` in `after()` so it doesn't hold up the reply.
    - Call `consumeStream()` so the answer is saved even if the browser disconnects.
    - `onError` maps the error through `classifyAiError` and sends the matching user message. For a 429, that's the spec's "try again in a minute" text.
    - Library mode returns `501` until Step 42.
    - Keep the route thin by putting mode handling in `lib/chat/respond.ts`.
  - **Files**:
    - `app/api/chat/route.ts`: request handling
    - `lib/chat/respond.ts`: mode dispatch, streaming, saving on finish
    - `lib/validation/chat.ts`: request body schema
  - **Step Dependencies**: Steps 28, 29
  - **User Instructions**: None

- [ ] Step 31: Chat UI building blocks
  - **Task**: `useArchiveChat({ chatId, mode, youtubeId, initialMessages })` wraps `useChat`. It uses `DefaultChatTransport`, and `prepareSendMessagesRequest` sends only the chat ID, mode, video and latest message.
    - `ChatPanel` combines the parts below and accepts `onFirstMessageSent`, used to update the URL.
    - `MessageList` scrolls to the bottom as text streams in, but not if the user has scrolled up. It shows a typing indicator while waiting.
    - `MessageBubble` styles messages by role.
    - `Composer`: Enter sends and Shift+Enter adds a new line. It's disabled while streaming and has a Stop button.
    - `Markdown` uses `react-markdown` and `remark-gfm`, and its text renderer turns bracketed timestamps into `TimestampLink`s.
      - `TimestampLink` seeks the player through `usePlayer()` when a player is on the page. Otherwise it links to `/videos/<id>?t=<seconds>`.
      - `parseTimestampCitations(text)` finds `[m:ss]`, `[h:mm:ss]` and `[n @ m:ss]`. Bare times such as `10:30` don't match.
    - `ChatError` shows the error inline with a Retry button, and the composer gets the unsent text back.
  - **Files**:
    - `lib/chat/use-archive-chat.ts`: `useChat` wrapper
    - `components/chat/chat-panel.tsx`: panel
    - `components/chat/message-list.tsx`: scroll behavior and typing indicator
    - `components/chat/message-bubble.tsx`: message bubble
    - `components/chat/composer.tsx`: input and keyboard handling
    - `components/chat/markdown.tsx`: markdown with timestamp links
    - `components/chat/timestamp-link.tsx`: seek or navigate
    - `components/chat/chat-error.tsx`: inline error with retry
    - `lib/chat/timestamps.ts`: citation parsing
    - `lib/chat/timestamps.test.ts`: matching and non-matching cases
  - **Step Dependencies**: Steps 25, 30
  - **User Instructions**: Run `npm i react-markdown remark-gfm`.

- [ ] Step 32: Chat on the video page
  - **Task**: Fill in the chat side of the video page.
    - If the video already has chats, open the most recent one and show a "New chat" button and a small list of earlier chats that link to `/chats/<id>`.
    - Otherwise, show the starter prompts (Summarize, Key takeaways, Outline). Clicking one creates a chat with a new UUID and sends that prompt in a single click.
    - While the transcript isn't `ready`, disable the chat and show a note explaining why.
    - Timestamps in answers seek the player on the same page.
  - **Files**:
    - `components/video/video-chat.tsx`: chat on the video page
    - `components/chat/starter-prompts.tsx`: the three starter buttons
    - `components/video/video-page-layout.tsx`: mount the chat
    - `app/(app)/videos/[youtubeId]/page.tsx`: load this video's chats and the latest chat's messages
  - **Step Dependencies**: Steps 27, 31
  - **User Instructions**: None

- [ ] Step 33: Chats page list and layout
  - **Task**: `app/(app)/chats/layout.tsx` puts the chat list on the left and the page content on the right.
    - Each list row shows a mode icon and label, a thumbnail and the video title for video chats, the chat title and a relative time. The open chat is highlighted.
    - On mobile, the list moves into a `Sheet` drawer opened from a header button.
    - `/chats/[id]` loads the chat and its messages on the server and renders a `ChatHeader` (title, mode, and a link to the video for video chats) above the `ChatPanel`. Timestamps there link to the video page, because there's no player.
    - Call `router.refresh()` when a reply finishes so the list order and titles update.
    - Add an empty-chats message, a loading skeleton and a not-found page.
  - **Files**:
    - `app/(app)/chats/layout.tsx`: two-pane layout that loads the list
    - `app/(app)/chats/page.tsx`: index (new chat, Step 34)
    - `app/(app)/chats/[id]/page.tsx`: open chat
    - `app/(app)/chats/[id]/not-found.tsx`: missing chat
    - `app/(app)/chats/loading.tsx`: skeleton
    - `components/chats/chat-list.tsx`: list
    - `components/chats/chat-list-item.tsx`: row
    - `components/chats/chat-list-drawer.tsx`: mobile drawer
    - `components/chats/chat-header.tsx`: header for the open chat
    - `components/chats/empty-chats.tsx`: empty state
  - **Step Dependencies**: Step 31
  - **User Instructions**: None

- [ ] Step 34: New chat with mode choice
  - **Task**: The `/chats` index shows `NewChat`.
    - A segmented control (`ToggleGroup`) offers One video, All my videos and Gemini only, defaulting to **All my videos**.
    - One video shows a searchable picker (`Command` inside a `Popover`) that filters by title and channel. Its options come from `listVideoOptions()` (ID, title, channel, status). Videos without a ready transcript are shown but disabled, with their status.
    - Submitting creates a UUID and sends the first message through `useArchiveChat`. Then `window.history.replaceState` changes the URL to `/chats/<id>` without remounting the stream, and the list refreshes when the reply finishes.
    - The page also accepts `?mode=video&video=<youtubeId>` to preselect a video, and reads a pending first question from `lib/chat/pending-start.ts`. This is filled in by Step 43.
  - **Files**:
    - `components/chats/new-chat.tsx`: mode state and submit flow
    - `components/chats/mode-selector.tsx`: segmented control
    - `components/chats/video-picker.tsx`: searchable picker
    - `lib/chat/pending-start.ts`: `sessionStorage` handoff for a pending first question, with `try`/`catch`
    - `lib/db/queries/videos.ts`: `listVideoOptions`
    - `app/(app)/chats/page.tsx`: render `NewChat` with the preselection from search params
  - **Step Dependencies**: Step 33
  - **User Instructions**: None

- [ ] Step 35: Rename and delete chats
  - **Task**: Add a chat overflow menu to each list row and to the chat header.
    - Rename opens a dialog with the current title filled in. It checks for 1 to 80 characters and updates the title right away, restoring the old one if saving fails.
    - Delete asks for confirmation, removes the chat and its messages, refreshes the list and goes to `/chats` if that chat was open.
  - **Files**:
    - `components/chats/chat-menu.tsx`: overflow menu
    - `components/chats/rename-chat-dialog.tsx`: rename dialog
    - `components/chats/delete-chat-dialog.tsx`: confirm dialog
    - `components/chats/chat-list-item.tsx`: add the menu
    - `components/chats/chat-header.tsx`: add the menu
  - **Step Dependencies**: Step 34
  - **User Instructions**: None

---

## Section 10: Indexing and library search (build order 4)

- [ ] Step 36: Transcript chunking
  - **Task**: `chunkTranscript(segments)` groups consecutive segments into chunks of about `CHUNK_TARGET_SECONDS`.
    - After passing the target length, it breaks at the next sentence end or a pause of 1.5 seconds or more, and always by `CHUNK_MAX_SECONDS`.
    - A single cue longer than the maximum is split by words, with times interpolated.
    - A final chunk shorter than 15 seconds is merged into the one before it.
    - It never returns an empty chunk.
    - Each chunk has `{ position, startSeconds, endSeconds, text }`.
    - Tests: target size, boundary choice, splitting a very long cue, merging a short last chunk, a single short transcript and estimated timestamps.
  - **Files**:
    - `lib/search/chunk.ts`: chunking
    - `lib/search/chunk.test.ts`: chunking cases
  - **Step Dependencies**: Step 4
  - **User Instructions**: None

- [ ] Step 37: Embedding service
  - **Task**: `embedDocuments(texts)` and `embedQuery(text)` call `embedMany` and `embed` with the configured embedding model.
    - Pass `outputDimensionality` from `EMBEDDING_DIMENSIONS`. Pass the document or query task type if the model supports task types; check the provider docs for `gemini-embedding-2`.
    - Scale every vector to unit length, because reduced-dimension output isn't normalized.
    - Throw `EmbeddingConfigError` if a vector's length isn't 768. That means the model or dimension setting changed.
    - Send batches of up to 100 inputs with `maxParallelCalls: 1`. On a 429, retry up to 3 times with backoff, using `retry-after` when present, and then fail with `rate_limited`.
    - `buildChunkEmbeddingInput(video, chunk)` puts the title and channel before the chunk text, which gives better matches.
    - Test normalization, the dimension check and the retry behavior with the AI SDK's mock embedding model.
  - **Files**:
    - `lib/ai/embed.ts`: embedding functions, normalization, retries
    - `lib/ai/embed.test.ts`: mock-model cases
    - `lib/search/embedding-input.ts`: chunk input text
  - **Step Dependencies**: Step 20
  - **User Instructions**: Check the embedding model's free-tier limits on AI Studio's rate-limit page. They are much lower than the chat model's, and Step 39 is designed around them.

- [ ] Step 38: Indexing each video and hooking it into the pipeline
  - **Task**: `indexVideo(videoId)` loads a `ready` video, chunks it and embeds the chunks.
    - In one transaction, it deletes the video's old chunks, inserts the new ones and sets `indexed_at`, `indexed_model` and `index_error = null`.
    - On failure it writes `index_error` and leaves the transcript `status` as `ready`.
    - Call it at the end of `processVideoTranscript`, inside the same `after()` work, and from `savePastedTranscript` in `after()`.
    - `POST /api/index/[youtubeId]` sets `maxDuration = 300`, runs `indexVideo` and waits for it, then returns the chunk count or a typed error (including `retryAfterSeconds` for 429s).
    - On the video page, show a quiet "Library search index failed" notice with a Retry button when `index_error` is set.
  - **Files**:
    - `lib/search/index-video.ts`: chunk, embed and replace in a transaction
    - `lib/db/queries/chunks.ts`: chunk insert, delete and count
    - `app/api/index/[youtubeId]/route.ts`: index one video
    - `lib/transcript/pipeline.ts`: call `indexVideo` after a successful write
    - `app/actions/transcripts.ts`: index after a paste
    - `components/video/index-status-notice.tsx`: failure notice with retry
    - `components/video/transcript-panel.tsx`: show the notice
  - **Step Dependencies**: Steps 22, 24, 36, 37
  - **User Instructions**: None

- [ ] Step 39: Re-index all
  - **Task**: `GET /api/index/pending?all=0|1` returns the IDs of `ready` videos to index. With `all=0`, that's videos where `indexed_model` differs from the current model, `indexed_at` is null or `index_error` is set. With `all=1`, it's every ready video.
    - A "Re-index all" dialog opens from a library page menu. It shows how many videos need indexing and has a "Rebuild everything" checkbox.
    - It calls `POST /api/index/[id]` for one video at a time and shows progress ("12 of 214") with a `Progress` bar.
    - On a 429 it shows a countdown, waits (`retry-after` or 60 seconds) and continues.
    - It has a Cancel button. Because each video records its model, a later run picks up where this one stopped.
    - The dialog asks the user to keep the tab open.
  - **Files**:
    - `app/api/index/pending/route.ts`: list of videos to index
    - `lib/search/reindex-client.ts`: client loop with pause, cancel and progress
    - `components/library/reindex-dialog.tsx`: dialog
    - `components/library/library-menu.tsx`: library page menu (more items later)
    - `app/(app)/library/page.tsx`: mount the menu
    - `lib/db/queries/videos.ts`: `listIndexCandidates`
  - **Step Dependencies**: Step 38
  - **User Instructions**: None

- [ ] Step 40: Hybrid search and choosing videos
  - **Task**: `hybridSearch(queryText)` embeds the query and runs `hybrid_search` through ``db.execute(sql`...`)``, passing the embedding as a `::vector` literal. It maps the rows to `ChunkMatch`.
    - `selectVideos(matches)` is pure:
      - It groups matches by video and scores each video as its best chunk score plus half the sum of its other chunk scores, with a cap.
      - It drops videos whose best chunk has neither a `keyword_rank` nor a `similarity` of at least `MIN_SEMANTIC_SIMILARITY`.
      - It returns the top `TOP_VIDEOS` with up to 3 matched timestamps each, or `{ kind: "no_match" }` when none remain.
    - In development, log the best similarity for each query to help tune the threshold.
    - Test grouping, scoring, the threshold, keyword-only matches and empty input with fixture rows.
  - **Files**:
    - `lib/search/types.ts`: `ChunkMatch`, `SelectedVideo`, `SearchOutcome`
    - `lib/search/hybrid.ts`: SQL call
    - `lib/search/select-videos.ts`: grouping, scoring and threshold
    - `lib/search/select-videos.test.ts`: fixture cases
  - **Step Dependencies**: Steps 9, 37
  - **User Instructions**: None

- [ ] Step 41: Rewriting follow-up questions
  - **Task**: `rewriteQuery(question, history)`:
    - With no earlier messages, return the question unchanged **without** calling the model.
    - Otherwise, ask the rewrite model to turn the follow-up into a standalone question and return only that question.
    - If the result is empty, longer than 500 characters, or the call fails, return the original question.
    - The rewritten question is used only for search. The chat still shows and saves what the user typed.
    - Tests with a mock model: no call on the first message, a rewrite, and falling back on an error.
  - **Files**:
    - `lib/ai/rewrite.ts`: `rewriteQuery`
    - `lib/ai/prompts/rewrite.ts`: rewrite prompt
    - `lib/ai/rewrite.test.ts`: mock-model cases
  - **Step Dependencies**: Step 20
  - **User Instructions**: None

- [ ] Step 42: "All my videos" chat mode
  - **Task**: Add library mode to `respond.ts`. The steps are: load the history, rewrite the question, run `hybridSearch`, then `selectVideos`.
    - **No match**: don't call the model. Write the fixed reply "I couldn't find this in your videos." with `createUIMessageStream` and save it with `sources: { kind: "no_match", question }`.
    - **Match**:
      1. Load the chosen videos' transcripts.
      2. `buildLibraryContext(videos, matches)` labels them `Video 1`, `Video 2` and `Video 3` (title and channel) followed by the timestamped lines. If the total is over `MAX_LIBRARY_CONTEXT_CHARS`, the largest transcripts are cut down to windows of ±3 minutes around their matched chunks and marked as excerpts.
      3. The system prompt says: answer only from these transcripts, cite each claim as `[n @ m:ss]`, reply exactly "I couldn't find this in your videos." if they don't contain the answer, and never add general knowledge.
      4. Send a `data-sources` part first (index, YouTube ID, title, channel, matched timestamps), then merge in the `streamText` output.
      5. Save the answer with `sources: { kind: "videos", videos }`.
    - If a matched answer begins with the fixed no-match sentence, the UI also shows "Ask Gemini instead".
    - Extend the citation parser so `[n @ m:ss]` maps to source `n`.
    - Test `buildLibraryContext`, including the budget trimming.
  - **Files**:
    - `lib/chat/respond.ts`: library branch
    - `lib/chat/library.ts`: search, selection and context steps
    - `lib/ai/prompts/library.ts`: grounded answer prompt
    - `lib/chat/sources.ts`: `MessageSources` Zod schema and helpers for writing and reading it
    - `lib/ai/context.ts`: `buildLibraryContext`
    - `lib/ai/context.test.ts`: library context and trimming cases
    - `lib/chat/timestamps.ts`: numbered citations
    - `lib/chat/timestamps.test.ts`: numbered citation cases
    - `lib/db/queries/messages.ts`: save sources
  - **Step Dependencies**: Steps 30, 40, 41
  - **User Instructions**: None

- [ ] Step 43: Sources display
  - **Task**: Under library answers, show a "Found in" row of compact cards, built from the saved sources or the streamed `data-sources` part.
    - Each card has a thumbnail, title, channel, matched timestamps as chips linking to `/videos/<id>?t=<seconds>`, and a "Continue with this video" button that opens `/chats?mode=video&video=<id>` with the composer focused.
    - Numbered citations in the answer link to the same places.
    - Sources pointing at deleted videos appear as a muted "Video deleted" card. Find these when loading `/chats/[id]` by looking up which cited YouTube IDs still exist.
    - For no-match replies, show "Ask Gemini instead". It stores the original question with `pending-start` and goes to `/chats?mode=general`, which sends it right away. The question goes through `sessionStorage`, not the URL.
  - **Files**:
    - `components/chat/sources-row.tsx`: "Found in" row
    - `components/chat/source-card.tsx`: card with timestamps and the continue button
    - `components/chat/no-match-reply.tsx`: no-match message and the Ask Gemini button
    - `components/chat/message-bubble.tsx`: show sources under assistant messages
    - `components/chats/new-chat.tsx`: send a pending first question automatically
    - `app/(app)/chats/[id]/page.tsx`: find which cited videos still exist
    - `lib/db/queries/videos.ts`: `existingYoutubeIds(ids)`
  - **Step Dependencies**: Steps 34, 42
  - **User Instructions**: None

---

## Section 11: Search box, export and finishing touches (build order 5)

- [ ] Step 44: Library search and sorting
  - **Task**: The library reads the `q` and `sort` (`added` or `published`) URL parameters, parsed with Zod and falling back to defaults.
    - With `q`, it matches `search_vector @@ websearch_to_tsquery('english', q)` **or** a case-insensitive match on `title` or `channel` (with `%` and `_` escaped, so partial words and very short queries still work). Results are ordered by `ts_rank` and then by the chosen sort.
    - The toolbar has a search box that updates the URL 300 ms after typing stops (`router.replace`, no history entries), a sort select, the result count and the library menu.
    - Show a "No videos match" state that's different from the empty-library state.
    - Test `escapeLike`.
  - **Files**:
    - `lib/db/queries/videos.ts`: search and sort
    - `lib/db/like.ts`: `escapeLike`
    - `lib/db/like.test.ts`: escaping cases
    - `lib/validation/library.ts`: search-parameter schema
    - `app/(app)/library/page.tsx`: read search parameters and pass them on
    - `components/library/library-toolbar.tsx`: toolbar
    - `components/library/search-input.tsx`: delayed URL update
    - `components/library/sort-select.tsx`: sort control
    - `components/library/no-results.tsx`: no-match state
  - **Step Dependencies**: Steps 8, 17, 39
  - **User Instructions**: None

- [ ] Step 45: Export format and filenames
  - **Task**: `formatTranscriptFile(video)` produces exactly the spec's format: `Title:`, `Channel:`, `URL:` (from `buildWatchUrl`) and `Published:` (`YYYY-MM-DD`, UTC), a blank line, then `segmentsToParagraphs` separated by blank lines. The file is UTF-8 with a trailing newline.

    `sanitizeFilename(title, fallbackId)`:
    - removes `\ / : * ? " < > |` and control characters
    - collapses whitespace and trims trailing dots and spaces
    - renames Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) by adding a suffix
    - shortens to `MAX_FILENAME_LENGTH` at a word boundary, counting code points so emoji stay intact
    - uses the YouTube ID when nothing is left

    `assignUniqueFilenames(names)` adds ` (2)`, ` (3)` and so on, compares names case-insensitively (Windows and macOS ignore case) and stays within the length limit once the suffix is added.

    Tests: header layout, paragraph breaks, every forbidden character, reserved names, shortening with emoji, case-insensitive duplicates, and a title that collides with an existing `(2)` suffix.
  - **Files**:
    - `lib/export/format.ts`: file text
    - `lib/export/filenames.ts`: sanitizing, shortening, duplicates
    - `lib/export/format.test.ts`: format cases
    - `lib/export/filenames.test.ts`: filename cases
  - **Step Dependencies**: Step 19
  - **User Instructions**: None

- [ ] Step 46: Export routes and the browser-built ZIP
  - **Task**: `GET /api/export` returns `{ files: [{ name, content }], skipped }` for every `ready` video, ordered by title, with unique names and `Cache-Control: no-store`.
    - `GET /api/export/[youtubeId]` returns one `text/plain; charset=utf-8` file with `Content-Disposition: attachment` and a `filename*=UTF-8''…` name, so non-ASCII titles survive.
    - `DownloadAllButton` sits in the library toolbar. It:
      - fetches the bundle and loads `jszip` only when clicked
      - puts every file in a `NicheArchive Transcripts/` folder inside the ZIP
      - builds it with a progress state and saves `NicheArchive Transcripts.zip` through an object URL
    - With no ready transcripts, show a toast instead of downloading an empty ZIP. When some videos were skipped, say so ("3 videos skipped: no transcript yet").
    - Add a single-transcript download button to the video page header.
  - **Files**:
    - `app/api/export/route.ts`: bundle
    - `app/api/export/[youtubeId]/route.ts`: single file
    - `lib/export/build-zip.ts`: ZIP assembly
    - `lib/export/save-blob.ts`: object-URL download helper
    - `components/library/download-all-button.tsx`: bundle download
    - `components/video/download-transcript-button.tsx`: single download
    - `components/library/library-toolbar.tsx`: add the button
    - `components/video/video-meta.tsx`: add the button
  - **Step Dependencies**: Steps 27, 44, 45
  - **User Instructions**: Run `npm i jszip`.

- [ ] Step 47: Error handling pass
  - **Task**: Make failures look the same everywhere.
    - `lib/errors.ts` brings the YouTube, AI and database error kinds into one table of user-facing messages. Include "Can't reach the database. If the Supabase project is paused, restore it from the Supabase dashboard."
    - Add an error boundary for the route group, a global error page and a root not-found page, each with a readable message and a Retry button.
    - Check every server action and route handler: they return typed failures instead of throwing, and nothing reaches a blank screen.
    - Use toasts for short-lived failures and inline messages for anything the user has to act on.
  - **Files**:
    - `lib/errors.ts`: combined error kinds and messages
    - `app/(app)/error.tsx`: route group boundary
    - `app/global-error.tsx`: global fallback
    - `app/not-found.tsx`: root not-found page
    - `components/common/error-state.tsx`: reusable inline error block
    - `app/actions/videos.ts`, `app/actions/transcripts.ts`, `app/actions/chats.ts`: use the shared failure results
    - `lib/ai/errors.ts`, `lib/youtube/errors.ts`: point to the shared messages
  - **Step Dependencies**: Steps 43, 46
  - **User Instructions**: None

- [ ] Step 48: Loading, empty states, mobile and removing the spike
  - **Task**: Final design pass against the brief.
    - Skeletons for the library, video and chats pages should match the real layouts, so nothing jumps when content loads.
    - Check every empty and waiting state: empty library, no search results, no chats, transcript processing, transcript failed, search index failed.
    - Check the layout at phone width: top bar menu, add dialog, video page tabs, chats drawer, picker popover and the "Found in" row, which should scroll sideways.
    - Check contrast in both themes. Color should appear only on status badges and errors, and borders should be thin.
    - Delete the Step 5 spike route and page.
  - **Files**:
    - `app/(app)/library/loading.tsx`, `app/(app)/chats/loading.tsx`, `app/(app)/videos/[youtubeId]/loading.tsx`: skeleton fixes
    - `components/layout/top-bar.tsx`, `components/layout/mobile-nav.tsx`: small-screen fixes
    - `components/video/video-page-layout.tsx`: tab fixes
    - `components/chats/chat-list-drawer.tsx`: drawer fixes
    - `components/chat/sources-row.tsx`: horizontal scroll on mobile
    - `app/globals.css`: final token and border adjustments
    - `app/dev/captions/page.tsx`, `app/api/dev/captions/route.ts`: delete
  - **Step Dependencies**: Step 47
  - **User Instructions**: Try the whole app once at phone width (browser dev tools or a real phone), especially the video page and an open chat, before accepting this step.

- [ ] Step 49: Database tests and CI
  - **Task**: Fill the remaining test gaps.
    - Add database integration tests that run every migration against PGlite with its vector extension. They check:
      - the generated `tsvector` columns fill in
      - the cascade delete removes a video's chunks, chats and messages
      - the chat check constraint rejects a video chat with no video
      - `hybrid_search` returns keyword-only, meaning-only and combined matches in the expected order, using small hand-made vectors
      - `claimForProcessing` claims a video only once and again only after the stall limit, never claims a ready one, and `writeTranscript` and `markTranscriptFailed` are ignored once their claim is gone (added by Step 22, whose throwaway check covered this)
    - Add mocked tests for the caption adapter's result mapping.
    - Add `typecheck` (`tsc --noEmit`) and `test:coverage` scripts.
    - Add a GitHub Actions workflow that runs `npm ci`, lint, typecheck and tests on every push.
  - **Files**:
    - `tests/db/setup.ts`: PGlite instance with the vector extension, applies the migrations
    - `tests/db/schema.test.ts`: generated columns, cascades, constraints
    - `tests/db/hybrid-search.test.ts`: ranking cases
    - `lib/youtube/captions.test.ts`: adapter mapping with a mocked library
    - `vitest.config.ts`: coverage settings, separate `db` project
    - `package.json`: `typecheck`, `test:coverage`, `test:db` scripts
    - `.github/workflows/ci.yml`: lint, typecheck, tests
  - **Step Dependencies**: Step 48
  - **User Instructions**: Run `npm i -D @electric-sql/pglite @electric-sql/pglite-pgvector @vitest/coverage-v8`. Since PGlite 0.5, pgvector ships as its own package: `import { vector } from "@electric-sql/pglite-pgvector"`. Run `set search_path to "$user", public, extensions` before applying the migrations, as on Supabase. Run `npm test`, `npm run test:db` and `npm run typecheck` locally and check that all three pass before pushing.

- [ ] Step 50: End-to-end smoke test (optional)
  - **Task**: Add one Playwright test for the main path against a seeded local database. It opens a seeded video, sees its transcript, clicks a timestamp, sends a video-chat message with the AI route stubbed, and downloads the single transcript. It intercepts every request to Google and YouTube, so it never uses quota or depends on the network.
  - **Files**:
    - `playwright.config.ts`: web server and base URL
    - `e2e/smoke.spec.ts`: main-path test
    - `e2e/fixtures/seed.ts`: seeded video, transcript and chat
    - `package.json`: `test:e2e` script
  - **Step Dependencies**: Step 49
  - **User Instructions**: Run `npm i -D @playwright/test`, then `npx playwright install chromium`. This step is optional; with two users and no public pages, testing by hand is reasonable.

- [ ] Step 51: Deployment and documentation
  - **Task**: Turn the README into real documentation. It should cover:
    - what the app does
    - every environment variable and where it comes from
    - local setup and the migration workflow, including custom migrations
    - deploying
    - the re-index action and when a change of embedding model needs it
    - the caption spike results

    Write `docs/troubleshooting.md` for the failures most likely to happen:
    - captions returning nothing on Vercel (expected; Gemini and pasting take over)
    - YouTube quota used up
    - Gemini rate limits and the daily video allowance
    - a renamed model
    - an embedding dimension mismatch
    - Supabase pausing
    - a stuck "processing" status

    In `vercel.json`, set `regions` to the function region nearest the Supabase region, keep the cron and add any per-route duration settings.
  - **Files**:
    - `README.md`: complete documentation
    - `docs/troubleshooting.md`: failures and fixes
    - `.env.example`: final key list, matching the README
    - `vercel.json`: region, cron, function settings
  - **Step Dependencies**: Step 49
  - **User Instructions**:
    1. In Vercel, add every variable from `.env.example` under **Settings → Environment Variables** for Production and Preview (`DATABASE_MIGRATION_URL` isn't needed there), then redeploy.
    2. Add one real video from start to finish. Check that the transcript arrives, that an "All my videos" question finds it, and that the ZIP unzips to a folder of `.txt` files.
    3. Share the URL with your friend.

# NicheArchive

A private web app for two people to archive YouTube videos with their English transcripts and ask Gemini about them. You can ask about one video, across the whole archive, or ask plain Gemini. Each person signs in with their own code and has their own chats, and it runs entirely on free tiers.

- Spec: [docs/spec-opus5-5.md](docs/spec-opus5-5.md)
- Build plan: [docs/plan-opus5-5.md](docs/plan-opus5-5.md)
- When something goes wrong: [docs/troubleshooting.md](docs/troubleshooting.md)

## What it does

- **Library.** Paste a YouTube link to save a video. The app looks up its title, channel, length and publish date, then gets its transcript in the background. Videos show as a grid of thumbnails with their transcript status. The search box matches words in titles, channels and transcripts, and partial titles and channel names too. Sort by date added or publish date.
- **Transcripts.** The app tries the video's English captions first, then Gemini transcription (public videos only), and finally asks you to paste the transcript yourself, with a link to youtubetotranscript.com. See [Transcripts and the caption spike](#transcripts-and-the-caption-spike).
- **Video page.** A player that stays pinned while you scroll, the transcript with a timestamp on every line that plays the video from there, and a chat about the video. Answers cite moments as `[m:ss]`, which play the video. On phones the transcript and chat are tabs.
- **Chats.** Saved chats in three modes:
  - **One video:** answers only from that video's transcript.
  - **All my videos:** searches the library by keyword and by meaning, sends Gemini the best three transcripts, and cites them as `[n @ m:ss]` with a "Found in" row of the videos. When nothing matches, it says "I couldn't find this in your videos." and offers to ask Gemini instead.
  - **Gemini only:** plain Gemini, without your transcripts.
- **Export.** "Download all" on the library page saves `NicheArchive Transcripts.zip`, which unzips to a folder with one `.txt` file per ready video, named after its title. A video page can download its own file. Each file has a short header, then the transcript as paragraphs:

  ```text
  Title: How Bread Rises
  Channel: The Kitchen Lab
  URL: https://www.youtube.com/watch?v=abc123xyz00
  Published: 2025-03-14

  First paragraph of the transcript...
  ```

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Drizzle ORM, Supabase Postgres with pgvector, and the Vercel AI SDK with Gemini. Hosted on Vercel Hobby. Tests use Vitest, with PGlite for the database.

## Run locally

Requires Node.js 22.12 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run db:migrate           # create the tables in your Supabase database
npm run dev                  # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (works without env values; they're checked on first use) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next's route types, then run `tsc` |
| `npm test` | Unit tests, once |
| `npm run test:watch` | Unit tests, re-run on change |
| `npm run test:db` | Database tests against PGlite with every migration applied |
| `npm run test:coverage` | All tests with a coverage report (`coverage/index.html`) |
| `npm run db:generate` | Write a migration from changes to `lib/db/schema.ts` |
| `npm run db:custom` | Write an empty migration for hand-written SQL |
| `npm run db:migrate` | Apply pending migrations to Supabase |
| `npm run db:studio` | Browse the database in Drizzle Studio |

While developing, restart `npm run dev` after a round of edits before checking pages that read the database. Next's development server can stop answering database requests after hot reloads ([details](docs/troubleshooting.md#local-development)).

## Environment variables

Set these in `.env.local` for development and in **Vercel → Project → Settings → Environment Variables** for deployment. [.env.example](.env.example) lists them all with comments. `lib/env.ts` validates them the first time the server reads them and names every missing or invalid key.

| Variable | Used for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | The app's database connection | Supabase → **Connect** → **Transaction pooler** (port 6543) |
| `DATABASE_MIGRATION_URL` | `drizzle-kit` migrations only; not needed on Vercel | Supabase → **Connect** → **Session pooler** (port 5432), plus `?sslmode=require` |
| `APP_PASSCODES` | Who can sign in, as `Name:code` pairs separated by commas | You choose them. The code alone signs you in, so make each one long; codes need at least 8 characters. Changing someone's code signs out only their devices. |
| `AUTH_SECRET` | Signs the session cookie (at least 32 characters) | `openssl rand -base64 32` |
| `YOUTUBE_API_KEY` | Video metadata (YouTube Data API v3) | Google Cloud Console → enable **YouTube Data API v3** → **Credentials** → API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini chat, transcription and embeddings | Google AI Studio → **Get API key** |
| `GEMINI_CHAT_MODEL` | Chat answers and video transcription | Default `gemini-3.8-flash` |
| `GEMINI_REWRITE_MODEL` | Rewriting follow-up questions before library search | Default `gemini-3.5-flash-lite` |
| `GEMINI_EMBEDDING_MODEL` | Embeddings for library search | Default `gemini-embedding-2` |
| `EMBEDDING_DIMENSIONS` | Embedding size. Must be `768` to match the vector column. | Leave at `768` |
| `CRON_SECRET` | Protects the daily database keep-alive cron | `openssl rand -base64 32` |

Google changes model names often. Check the three model names against AI Studio's current model list, because an outdated name only fails when it's called.

Without `openssl`, generate a secret with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Supabase's **Direct connection** string (`db.<ref>.supabase.co`) is IPv6-only, and neither Vercel nor most home connections can reach it. Use the two pooler strings above.

## Access

Each person has their own code in `APP_PASSCODES`; there's no registering or username. `proxy.ts` sends any device without a valid `na_session` cookie to `/unlock`, and API requests without one get `401` JSON. Only `/unlock` and `/api/cron/*` are open; the cron route checks `CRON_SECRET` itself. The cookie names who signed in, is signed with `AUTH_SECRET` and lasts 30 days. It stops working when that person's code changes, when they're removed from `APP_PASSCODES`, or when `AUTH_SECRET` changes. **Sign out** is in the menu behind the person icon in the top bar, or in the ☰ menu on phones.

Each IP address gets 5 tries at a code. A wrong fifth try locks that address out for an hour, and a right code clears its count. The tries live in the `unlock_attempts` table, keyed by an HMAC of the address rather than the address itself, and the daily cron deletes rows over a day old.

Videos, search and export are shared. Chats belong to whoever started them: the chat list, a video's chats and a chat's own page show only your own, and opening someone else's chat link shows "Chat not found". Chats are saved under the name, so renaming someone in `APP_PASSCODES` leaves their old chats under the old name.

The proxy isn't the only check. Every server action calls `getSession()`, every route handler except the cron is wrapped in `withSession()`, and pages that read chats call `pageSession()`. All three live in [lib/auth/require-session.ts](lib/auth/require-session.ts). A server action is posted to whichever page uses it, so a matcher change could leave it outside the proxy. `robots.txt` and `noindex` tags also keep search engines away.

## Database migrations

The schema lives in [lib/db/schema.ts](lib/db/schema.ts), and the migrations drizzle-kit writes from it live in `drizzle/`. `drizzle-kit` reads `.env.local` itself and connects through `DATABASE_MIGRATION_URL`, Supabase's session pooler. The app uses the transaction pooler, which can't run schema changes reliably.

**Changing the schema:**

1. Edit `lib/db/schema.ts`.
2. Run `npm run db:generate -- --name=<what_changed>` and read the SQL it writes.
3. Run `npm run db:migrate`.

**Hand-written SQL** (extensions, functions and anything else Drizzle can't express):

1. Run `npm run db:custom -- --name=<what_it_does>`. This creates an empty migration and records it in `drizzle/meta/`, so it runs in order with the rest.
2. Write the SQL in the new file. Separate statements with `--> statement-breakpoint`.
3. Run `npm run db:migrate`.

Never edit a migration that has already been applied; add a new one. To change `hybrid_search`, for example, write a new custom migration with `create or replace function`. `npm run test:db` applies every migration to a fresh PGlite database, so it catches a migration that doesn't run.

| Migration | What it does |
| --- | --- |
| `0000_enable_pgvector` | Enables pgvector in the `extensions` schema, before any table needs the `vector` type |
| `0001_initial_schema` | The four tables, enums, indexes (GIN for keyword search, HNSW for embeddings) and row-level security |
| `0002_hybrid_search` | The `hybrid_search` function: keyword and meaning ranks merged with Reciprocal Rank Fusion |

Two things specific to Supabase:

- pgvector lives in the `extensions` schema, which Supabase puts on every role's search path, so the migrations use `vector` without a schema prefix. `hybrid_search` pins its own search path.
- Every table has row-level security on with no policies. That blocks Supabase's Data API, which exposes the `public` schema to the project's anon key. The app connects as the tables' owner, which RLS doesn't restrict. The app never uses the Data API, so you can also turn it off under **Project Settings → Data API**.

If `npm run db:migrate` fails on the extension, enable **vector** under **Database → Extensions** in Supabase and run it again.

## Deploying

The app deploys to Vercel Hobby from the GitHub repository. A deploy never touches the database schema: run `npm run db:migrate` from your machine before deploying code that needs a new migration.

1. **Database.** Create a free Supabase project, and run `npm run db:migrate` locally with `DATABASE_MIGRATION_URL` pointing at it.
2. **Project.** In Vercel, import the GitHub repository. The Next.js defaults are right; there's no build setting to change.
3. **Environment variables.** Add every variable from `.env.example` except `DATABASE_MIGRATION_URL`, for both **Production** and **Preview**. Then redeploy, since variables only reach new deployments.
4. **Check it.** Add one real video from start to finish: the transcript should arrive, an "All my videos" question should find it, and "Download all" should give a ZIP that unzips to a folder of `.txt` files.

What [vercel.json](vercel.json) sets up:

- **Region `iad1`** (Washington, D.C.), next to the Supabase project in `us-east-1`. Every request makes several database round trips, so keep the two together. If the database ever moves, change the region to match.
- **A daily cron** at 12:00 UTC that calls `/api/cron/ping`, so Supabase's free tier doesn't pause the database after a week without use. It runs only on the production deployment. Vercel sends `CRON_SECRET` with it.

Time limits live in the route files as `maxDuration`, which is how Next.js sets them: 300 seconds, the Hobby maximum, for getting transcripts and building the search index, and 60 seconds for chat. Anything slower is cut off and shows as failed with a Retry button.

Preview deployments sit behind Vercel's Deployment Protection, so only you can open them. Production needs a code (see [Access](#access)).

## Library search index and re-indexing

"All my videos" answers come from a search index: each transcript is cut into chunks of about a minute, and each chunk is embedded with `GEMINI_EMBEDDING_MODEL`. A video is indexed as soon as its transcript arrives. If that fails, its page shows "Library search index failed" with a Retry button; the transcript itself is fine.

Each video records the model it was indexed with. After changing `GEMINI_EMBEDDING_MODEL`, open the library's **⋯** menu and choose **Re-index all**. The dialog offers only the videos that need it, or, with its "Index all … again" checkbox, every ready video. It indexes one video at a time and waits out the free tier's rate limits, so keep the tab open. A run that stops partway can be started again later.

Embeddings must stay 768 numbers long, the size of the database's vector column. A model or `EMBEDDING_DIMENSIONS` value that gives another size fails with a message saying so ([details](docs/troubleshooting.md#embedding-dimension-mismatch)).

## Transcripts and the caption spike

A new video's transcript comes from the first of these that works:

1. **Captions.** The video's English caption track, the uploader's if there is one, else YouTube's auto-generated one. It needs no key, but YouTube can refuse these requests from cloud servers.
2. **Gemini.** Gemini watches the video through its YouTube link and transcribes it. This only works for public videos, and uses the chat model's free allowance.
3. **Pasting.** The video page links to youtubetotranscript.com, where you can copy a transcript and paste it back. The app never sends requests to that site.

Before the rest was built, a test page measured how often captions work (the spec's build order step 1). Its results are in [docs/caption-spike.md](docs/caption-spike.md):

- **Local, 2026-09-25:** 7 of the 10 test videos returned captions, in under 1.4 seconds each. The other three have no English track, as expected.
- **Deployed:** still to run from a preview deployment, which is the result that matters, since cloud IPs are what YouTube blocks. The doc says how.

The test page (`/dev/captions`) and its route stay until the deployed column is filled in, then get deleted. In production the route answers `404`.

## Testing and CI

- `npm test` runs the unit tests. AI calls use the AI SDK's mock models, and nothing touches the network or the real database.
- `npm run test:db` runs the database tests against PGlite, Postgres compiled to WebAssembly, with pgvector and every migration applied. They cover the generated search columns, cascading deletes, the chat mode check, `hybrid_search`'s ranking, the transcript processing claim, and library search.
- `npm run test:coverage` runs both with a coverage report.

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs lint, typecheck and both test suites on every push and pull request. It needs no secrets.

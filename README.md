# NicheArchive

A web app for two people to archive YouTube videos with their English transcripts and ask Gemini about them. You can ask about one video, across the whole archive, or ask plain Gemini. It runs entirely on free tiers.

- Spec: [docs/spec-opus5-5.md](docs/spec-opus5-5.md)
- Build plan: [docs/plan-opus5-5.md](docs/plan-opus5-5.md)

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Drizzle ORM, Supabase Postgres with pgvector, and the Vercel AI SDK with Gemini. Hosted on Vercel Hobby. Tests use Vitest.

## Run locally

Requires Node.js 22.12 or later.

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
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
| `npm run db:generate` | Write a migration from changes to `lib/db/schema.ts` |
| `npm run db:custom` | Write an empty migration for hand-written SQL |
| `npm run db:migrate` | Apply pending migrations to Supabase |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Environment variables

Set these in `.env.local` for development and in **Vercel → Project → Settings → Environment Variables** for deployment. [.env.example](.env.example) lists them all with comments. `lib/env.ts` validates them the first time the server reads them and names every missing or invalid key.

| Variable | Used for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | The app's database connection | Supabase → **Connect** → **Transaction pooler** (port 6543) |
| `DATABASE_MIGRATION_URL` | `drizzle-kit` migrations only | Supabase → **Connect** → **Session pooler** (port 5432) |
| `YOUTUBE_API_KEY` | Video metadata (YouTube Data API v3) | Google Cloud Console → enable **YouTube Data API v3** → **Credentials** → API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini chat, transcription and embeddings | Google AI Studio → **Get API key** |
| `GEMINI_CHAT_MODEL` | Chat answers and video transcription | Default `gemini-3.8-flash` |
| `GEMINI_REWRITE_MODEL` | Rewriting follow-up questions before library search | Default `gemini-3.5-flash-lite` |
| `GEMINI_EMBEDDING_MODEL` | Embeddings for library search | Default `gemini-embedding-2` |
| `EMBEDDING_DIMENSIONS` | Embedding size. Must be `768` to match the vector column. | Leave at `768` |
| `CRON_SECRET` | Protects the daily database keep-alive cron | `openssl rand -hex 32` |

Google changes model names often. Check the three model names against AI Studio's current model list, because an outdated name only fails when it's called.

After changing `GEMINI_EMBEDDING_MODEL`, open the library's **⋯** menu and choose **Re-index all**. Each video records the model it was indexed with, so the dialog offers only the videos that need it. It indexes one video at a time and waits out the free tier's rate limits, so keep the tab open. A run that stops partway can be started again later.

Without `openssl`, generate a secret with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Access

There's no sign-in. Anyone who has the site's URL can use it: read, add and delete videos and chats, and ask questions that spend the free Gemini and YouTube quotas. The site is only unlisted: `robots.txt` and `noindex` tags keep search engines away, so share the URL only with people you trust.

The API keys and database credentials still stay on the server. The daily keep-alive route is the one route that checks a secret: Vercel Cron sends `CRON_SECRET` with each call.

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

Never edit a migration that has already been applied; add a new one. To change `hybrid_search`, for example, write a new custom migration with `create or replace function`.

| Migration | What it does |
| --- | --- |
| `0000_enable_pgvector` | Enables pgvector in the `extensions` schema, before any table needs the `vector` type |
| `0001_initial_schema` | The four tables, enums, indexes (GIN for keyword search, HNSW for embeddings) and row-level security |
| `0002_hybrid_search` | The `hybrid_search` function: keyword and meaning ranks merged with Reciprocal Rank Fusion |

Two things specific to Supabase:

- pgvector lives in the `extensions` schema, which Supabase puts on every role's search path, so the migrations use `vector` without a schema prefix. `hybrid_search` pins its own search path.
- Every table has row-level security on with no policies. That blocks Supabase's Data API, which exposes the `public` schema to the project's anon key. The app connects as the tables' owner, which RLS doesn't restrict. The app never uses the Data API, so you can also turn it off under **Project Settings → Data API**.

If `npm run db:migrate` fails on the extension, enable **vector** under **Database → Extensions** in Supabase and run it again.

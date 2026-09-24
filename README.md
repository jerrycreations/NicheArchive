# NicheArchive

A private web app for two people to archive YouTube videos with their English transcripts and ask Gemini about them. You can ask about one video, across the whole archive, or ask plain Gemini. It sits behind a shared passcode and runs entirely on free tiers.

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

## Environment variables

Set these in `.env.local` for development and in **Vercel → Project → Settings → Environment Variables** for deployment. [.env.example](.env.example) lists them all with comments. `lib/env.ts` validates them the first time the server reads them and names every missing or invalid key.

| Variable | Used for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | The app's database connection | Supabase → **Connect** → **Transaction pooler** (port 6543) |
| `DATABASE_MIGRATION_URL` | `drizzle-kit` migrations only | Supabase → **Connect** → **Session pooler** (port 5432) |
| `APP_PASSCODE` | The shared passcode that unlocks the site | You choose it. Changing it signs out every device. |
| `AUTH_SECRET` | Signs the session cookie (at least 32 characters) | `openssl rand -base64 32` |
| `YOUTUBE_API_KEY` | Video metadata (YouTube Data API v3) | Google Cloud Console → enable **YouTube Data API v3** → **Credentials** → API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini chat, transcription and embeddings | Google AI Studio → **Get API key** |
| `GEMINI_CHAT_MODEL` | Chat answers and video transcription | Default `gemini-3.8-flash` |
| `GEMINI_REWRITE_MODEL` | Rewriting follow-up questions before library search | Default `gemini-3.5-flash-lite` |
| `GEMINI_EMBEDDING_MODEL` | Embeddings for library search | Default `gemini-embedding-2` |
| `EMBEDDING_DIMENSIONS` | Embedding size. Must be `768` to match the vector column. | Leave at `768` |
| `CRON_SECRET` | Protects the daily database keep-alive cron | `openssl rand -hex 32` |

Google changes model names often. Check the three model names against AI Studio's current model list, because an outdated name only fails when it's called.

Without `openssl`, generate a secret with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

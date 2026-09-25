# Troubleshooting

The failures most likely to happen, what the app says when they do, and what to do about them. The messages in quotes are what the app shows; the full error is always in the server log (Vercel → Project → **Logs**, or the terminal running `npm run dev`).

- [Captions come back empty on Vercel](#captions-come-back-empty-on-vercel)
- [YouTube's daily quota is used up](#youtubes-daily-quota-is-used-up)
- [Gemini's rate limits and daily allowance](#geminis-rate-limits-and-daily-allowance)
- [A Gemini model was renamed](#a-gemini-model-was-renamed)
- [Embedding dimension mismatch](#embedding-dimension-mismatch)
- [Supabase paused the database](#supabase-paused-the-database)
- [A video is stuck processing](#a-video-is-stuck-processing)
- [Local development](#local-development)

## Captions come back empty on Vercel

**What you see:** new videos take a minute or two longer to get a transcript, and the transcript's source label says Gemini rather than captions. On a video where everything failed, the reasons include something like "Captions: YouTube said LOGIN_REQUIRED: Sign in to confirm you're not a bot."

**Why:** YouTube often refuses caption requests from cloud servers such as Vercel's, while the same request from home works. This is expected, and the app is built for it: the video moves on to Gemini transcription, and then to pasting.

**What to do:** nothing, unless it bothers you. [docs/caption-spike.md](caption-spike.md) explains how to measure how often it happens from a preview deployment. For a video Gemini can't do (a private or unlisted one, or one without speech), paste the transcript on its page.

## YouTube's daily quota is used up

**What you see:** adding a video says "YouTube's daily lookup limit is used up. Try again tomorrow."

**Why:** the YouTube Data API allows 10,000 units a day per Google Cloud project, and each video added costs 1. Using that up means something else shares the key, or something is looping.

**What to do:** wait for the quota to reset at midnight Pacific time. Check **Google Cloud Console → APIs & Services → YouTube Data API v3 → Quotas** for what used it, and restrict the key to the YouTube Data API v3 if it isn't already. Captions and Gemini don't use this quota.

## Gemini's rate limits and daily allowance

**What you see:** one of:

- "Gemini's free limit was reached. Try again in a minute." The per-minute limit: wait a minute.
- "Gemini's free daily limit for this model was reached. It resets at midnight Pacific time." The per-day limit.

**Why:** the free tier has small limits, and they change. As of September 2026, `gemini-3.8-flash` allowed only 20 requests a day per project, shared by chat answers and video transcription. The rewrite and embedding models have limits of their own. Gemini can transcribe about 8 hours of video a day for free.

**What to do:**

- Check the current limits on AI Studio's rate-limit page.
- To keep chatting after the daily limit, set `GEMINI_CHAT_MODEL` to a model with quota left, such as `gemini-3.5-flash-lite`, and redeploy. Set it back the next day.
- "Re-index all" waits out per-minute limits by itself. When the daily embedding limit runs out, it stops and says so; run it again the next day, and it carries on where it stopped.

## A Gemini model was renamed

**What you see:** "A Gemini model name in the server settings is missing or no longer available. Check GEMINI_CHAT_MODEL, GEMINI_REWRITE_MODEL and GEMINI_EMBEDDING_MODEL against AI Studio's model list."

**Why:** Google retires and renames models often, and a model name is only checked when it's called.

**What to do:** find current names in AI Studio's model list, update the variable in `.env.local` and in Vercel, and redeploy. If you changed `GEMINI_EMBEDDING_MODEL`, run **Re-index all** from the library's **⋯** menu afterwards. Old and new embeddings can't be compared, so library search is unreliable until every video is re-indexed.

## Embedding dimension mismatch

**What you see:** indexing fails with "The embedding model returned vectors of N numbers, but the database stores 768. Check GEMINI_EMBEDDING_MODEL and EMBEDDING_DIMENSIONS." Or "Invalid environment variables" naming `EMBEDDING_DIMENSIONS`.

**Why:** the database's vector column holds exactly 768 numbers per embedding. The app asks the model for 768 and refuses anything else, so a wrong setting fails loudly instead of filling the index with unusable vectors.

**What to do:** set `EMBEDDING_DIMENSIONS=768`, and pick an embedding model that can produce 768-number vectors. Using a different size means a new migration: change `vector(768)` in `transcript_chunks` and in the `hybrid_search` function, change `EMBEDDING_VECTOR_DIMENSIONS` in `lib/constants.ts`, then run **Re-index all** with its "Index all … again" box ticked.

## Supabase paused the database

**What you see:** pages say "Can't reach the database. If the Supabase project is paused, restore it from the Supabase dashboard." Actions and buttons show the same message.

**Why:** Supabase's free tier pauses a project after a week without activity. The daily cron (`/api/cron/ping`, set in `vercel.json`) is there to prevent that, so a pause usually means the cron isn't running. The same message appears whenever the database can't be reached at all, for example with a wrong `DATABASE_URL`.

**What to do:**

1. In the Supabase dashboard, open the project and choose **Restore project**. It takes a few minutes. Then select **Retry** on the page.
2. Check that the cron works: **Vercel → Project → Settings → Cron Jobs** should list `/api/cron/ping` with recent successful runs. Crons run only on the production deployment, and `CRON_SECRET` must be set there.
3. If the project isn't paused, check `DATABASE_URL`: it should be the **Transaction pooler** string on port 6543, not the IPv6-only **Direct connection** string. Supabase's pooler answers "Tenant or user not found" for a wrong project reference, which the server log shows.

## A video is stuck processing

**What you see:** a video shows "Getting the transcript…" for a long time. After 6 minutes it turns into a failure, "Getting the transcript took too long and was stopped.", with a Retry button.

**Why:** the work was cut off before it could record a result. Vercel stops a function after 300 seconds, and a deploy or a crash in the middle stops it too. Transcribing a long video with Gemini is the likeliest to run out of time.

**What to do:** select **Retry**. If it keeps timing out, paste the transcript instead: the page links to youtubetotranscript.com. A retry or paste can't collide with a run that's still going: only one run can hold a video at a time, and a paste always wins.

## Local development

- **Pages stop loading after edits.** Next's development server can stop answering database requests after a few hot reloads: pages that read the database hang, while others still work. Restart `npm run dev`. Production isn't affected.
- **`ENOTFOUND db.<ref>.supabase.co`.** Supabase's Direct connection host is IPv6-only. Use the pooler strings described in the README.
- **`npm run typecheck` fails in `.next/dev/types/validator.ts` after a route was deleted.** Only a running `next dev` rewrites those types. Stop the dev server, delete `.next/dev/types`, and run the typecheck again.
- **Only one `next dev` can run per folder.** To check something while another session's dev server is running, use `npm run build` and `npm start` instead.

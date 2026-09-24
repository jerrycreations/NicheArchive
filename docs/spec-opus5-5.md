# NicheArchive

## Project Description

A web app for two people to archive YouTube videos and their transcripts and ask Google's Gemini questions about them. Videos are added one at a time by URL. The app stores the link, metadata and thumbnail (never the video file) and gets the English transcript automatically. Users can chat about one video, ask a question across the whole archive (the app finds the relevant videos and answers from their transcripts), or chat with plain Gemini. Chats are saved. All transcripts can be downloaded as a folder of .txt files. Everything runs on free tiers.

## Target Audience

- The owner and one friend, who share the site's unlisted URL
- Not advertised; no plans to show it to others yet
- Expected to grow to hundreds of mostly short videos

## Desired Features

### Video Library

- [ ] Add one video at a time by pasting a YouTube URL
  - [ ] Accept all URL formats (`watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`), including extra parameters like `&t=` or `&list=`
  - [ ] If the video is already saved, say so and link to it
  - [ ] Reject private or deleted videos with a clear message
  - [ ] Fetch metadata automatically: title, channel, duration, publish date, thumbnail
  - [ ] Warn before adding a video longer than 30 minutes (it can still be added)
- [ ] Library page: a grid of thumbnail cards showing title, channel, duration, date added and transcript status
  - [ ] Search box that matches titles, channels and transcript text (keyword search)
  - [ ] Sort by date added or publish date
- [ ] Video page with embedded player, transcript and chat
- [ ] Delete a video, along with its transcript, search index and video chats (after a confirm dialog)

### Transcripts (English only)

- [ ] Get the transcript automatically when a video is added, trying these in order:
  1. [ ] The video's own English caption track, published by YouTube (prefer manual captions over auto-generated)
  2. [ ] For public videos, Gemini transcribes from the YouTube URL and returns timestamped segments
  3. [ ] The user pastes the transcript manually
     - [ ] An "Open in youtubetotranscript.com" link opens that site in a new tab so the user can copy the text by hand and paste it back. The app itself never sends requests there.
- [ ] Store both the timestamped segments and a plain-text version
- [ ] Record where each transcript came from (manual captions, auto captions, Gemini or pasted)
- [ ] Show a status for each video (pending, ready or failed) with a retry button
- [ ] Transcript viewer with clickable timestamps that jump the player to that moment
- [ ] Copy transcript to clipboard

### AI Chat (Gemini)

- [ ] Each chat has a mode, chosen when it starts:
  - [ ] **One video:** each question is sent with that video's full transcript (including timestamps) and the conversation so far
  - [ ] **All my videos:** the app finds the relevant videos and answers from their transcripts (see [Library Search](#library-search-asking-without-picking-a-video))
  - [ ] **Gemini only:** the question and conversation go to Gemini with no transcripts
- [ ] Chats started from a video page use that video; the Chats page defaults to "All my videos"
- [ ] Stream responses
- [ ] Timestamps in answers are links that jump to that moment in the video
- [ ] Starter prompts in video chats: Summarize, Key takeaways, Outline
- [ ] Chats are saved and shared between both users
  - [ ] The Chats page lists all chats, newest first, showing the mode and, for video chats, the video's thumbnail and title
  - [ ] A chat's title is generated from its first question and can be renamed
  - [ ] Reopen and continue any chat; delete a chat
- [ ] Show a clear "try again in a minute" message when the rate limit is hit (429)

### Library Search (asking without picking a video)

- [ ] When a transcript is saved, split it into chunks of about 1 minute and index each chunk:
  - [ ] By meaning: an embedding from Gemini Embedding 2, stored with pgvector
  - [ ] By keyword: Postgres full-text search
- [ ] When a question is asked:
  - [ ] Search chunks by meaning and by keyword, then merge the two rankings (Supabase hybrid search, Reciprocal Rank Fusion)
  - [ ] Group matches by video and take the top 3 videos
  - [ ] Send those videos' full transcripts and the question to Gemini, instructing it to answer only from them and cite the video and timestamp
- [ ] Answers show a "Found in" row of video cards with timestamp links
  - [ ] "Continue with this video" button starts a chat about that video
- [ ] If nothing matches well enough, reply "I couldn't find this in your videos" with an "Ask Gemini instead" button; never quietly mix in general knowledge
- [ ] Before searching, a fast Gemini model rewrites follow-up questions into full questions, so "what else did they say about it?" still finds the right video
- [ ] "Re-index all" action rebuilds every index if the embedding model changes

### Export

- [ ] "Download all transcripts" button
  - [ ] Downloads `NicheArchive Transcripts.zip`, which unzips to a folder with one .txt file per video
  - [ ] Each file is named after the video title, e.g. `How Bread Rises.txt`
    - [ ] Remove characters that aren't allowed in filenames (`\ / : * ? " < > |`)
    - [ ] Add a suffix to duplicate titles: `How Bread Rises (2).txt`
    - [ ] Shorten very long titles
  - [ ] Each file has a short header, then the transcript as plain paragraphs with no timestamps (see [Export .txt format](#export-txt-format))
- [ ] Download a single video's transcript from its page, in the same format

### Access

- [ ] No user accounts
- [ ] No passcode either (dropped on 2026-09-24, because unlocking got in the way during development): the site is unlisted, search engines are asked not to index it, and anyone with the URL can use it
- [ ] Gemini key, YouTube key and database credentials stay on the server only

### Later (not in v1)

- [ ] Select several videos and ask about them together
- [ ] Highlight and scroll to the current transcript line during playback
- [ ] Edit a transcript (e.g. cut sponsor reads)
- [ ] Tags or collections; filter by channel or tag
- [ ] Personal notes on each video
- [ ] Clean up auto-caption text (add punctuation) with Gemini
- [ ] Let Gemini decide when to search the library inside a normal chat (tool calling)
- [ ] Bookmarklet or browser extension that lets the user send a transcript from a YouTube page they have open to the app, if the caption library proves unreliable in production

## Design Requests

- [ ] Minimal, neutral look
  - [ ] Grayscale palette (shadcn "neutral" base color) with no brand accent color
  - [ ] Color used only where it means something: status badges (processing, failed) and error states; thumbnails supply the rest
  - [ ] Geist font (Next.js default), generous whitespace, thin borders instead of heavy shadows
- [ ] Dark mode that follows the system setting, with a toggle
- [ ] Responsive and usable on a phone
- [ ] Top bar on every page: app name, Library and Chats links, "Add video" button, theme toggle
- [ ] Library page: add-video box, search, sort, thumbnail grid
- [ ] Video page: player and transcript on the left, chat on the right (tabs on mobile)
- [ ] Chats page: chat list on the left, open chat on the right (the list becomes a drawer on mobile)
  - [ ] New chat: a segmented control for One video / All my videos / Gemini only; choosing "One video" shows a searchable video picker
- [ ] Clear states: loading skeletons, a "transcript processing" indicator, empty-library and empty-chats messages, error toasts

## Other Notes

### Stack

- Latest Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Drizzle ORM, Supabase Postgres with pgvector

### AI

- Free Google AI Studio key, called through the Vercel AI SDK (`ai` + `@ai-sdk/google`)
- Model names are set in environment variables because Google changes them often. Defaults (all free tier as of Sept 2026):

  | Use | Default model |
  | --- | --- |
  | Chat and transcription | `gemini-3.8-flash` |
  | Follow-up rewriting | `gemini-3.5-flash-lite` |
  | Embeddings | `gemini-embedding-2` at 768 dimensions |

### External Services

- **Metadata:** YouTube Data API v3 (free key, 10,000 units/day; one video lookup costs 1 unit)
- **Captions:** a community library such as `youtube-transcript` reads the video's published English caption track, the same track the YouTube player offers viewers. No API key is needed. Caption tracks aren't always reachable, so the app treats this as a best-effort first attempt and moves on to the next source when it comes back empty.
- **youtubetotranscript.com:** the app never sends requests to this site. It renders a link the user clicks to open the site themselves, read the transcript there, and copy it back by hand. Automated use was ruled out because the site offers no public API and its terms don't permit it.

### Data Model (Drizzle)

- **videos:** YouTube ID (unique), title, channel, duration, publish date, transcript segments (JSON), transcript text, transcript source, status, error message, date added, keyword search index
- **transcript_chunks:** video, position, start and end time, text, embedding (768-dimension vector, HNSW index), keyword search index (GIN)
- **chats:** title, mode (video, library or general), video (video chats only; deleting the video deletes its chats), created and updated dates
- **messages:** chat, role (user or assistant), content, sources (the videos and timestamps a library answer used), created date
- A custom SQL migration enables pgvector and adds the hybrid search function
- **Size estimate:** hundreds of short videos come to a few thousand chunks, only tens of MB including embeddings, well under Supabase's 500 MB

### Export .txt Format

```text
Title: How Bread Rises
Channel: The Kitchen Lab
URL: https://www.youtube.com/watch?v=abc123xyz00
Published: 2025-03-14

First paragraph of the transcript...

Second paragraph...
```

- A new paragraph starts at pauses of 2+ seconds in the captions
- Auto-generated captions have no punctuation; v1 keeps them as they are
- The ZIP is built in the browser with JSZip from transcripts returned by a server route

### Hosting

- Vercel Hobby (free, non-commercial) with Supabase Free
- A daily Vercel Cron job pings the database so Supabase doesn't pause after 7 days of inactivity
- In Drizzle, use Supabase's transaction pooler connection string with `prepare: false`
- Thumbnails aren't stored; they're built from the video ID: `https://i.ytimg.com/vi/<id>/hqdefault.jpg`

### Build Order

1. Test page on Vercel that fetches captions for ~10 real videos (confirms the transcript approach)
2. Library, adding videos, transcripts
3. Video chat and saved chats
4. Indexing and "All my videos" chat
5. Export, search box, finishing touches

### Risks

- Caption tracks may not be reachable from a cloud host. Deployed on Vercel, the caption library may come back empty where it succeeds locally. This is designed for rather than worked around: an empty result moves the video to Gemini transcription, and then to manual paste. Build order step 1 measures how often this happens before the rest is built.
- Gemini's YouTube-URL feature is still in preview. The free tier allows 8 hours of video per day, which is plenty here.
- Gemini transcriptions can be less word-for-word than captions, and auto-captions misspell names; keyword + meaning search together reduce missed matches
- Google may use free-tier prompts to improve its products

### Out of Scope

- Bulk add, playlist or channel import
- Non-English videos, translation
- User accounts

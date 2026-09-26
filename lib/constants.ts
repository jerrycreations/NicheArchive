// Tunable values shared by server and client code. Secrets and model names
// live in lib/env.ts instead.

/** Adding a video longer than this (30 minutes) asks for confirmation first. */
export const LONG_VIDEO_WARNING_SECONDS = 1800;

/** Transcript chunks for the search index aim for about this length. */
export const CHUNK_TARGET_SECONDS = 60;

/** A chunk is cut here even mid-sentence, so no chunk grows unbounded. */
export const CHUNK_MAX_SECONDS = 90;

/** A pause this long between captions starts a new paragraph (spec: 2+ seconds). */
export const PARAGRAPH_GAP_SECONDS = 2;

/**
 * Speech with no such pause (Gemini and pasted transcripts, overlapping
 * auto-captions) starts a new paragraph at the first sentence end after this
 * long, or anywhere after twice this long, since auto-captions have no
 * punctuation.
 */
export const PARAGRAPH_MAX_SECONDS = 60;

/**
 * The transcript viewer merges caption cues into lines of about 10 to 20
 * seconds. A line ends at a sentence end or a pause once it's this long…
 */
export const DISPLAY_LINE_MIN_SECONDS = 10;

/** …and anywhere once it's this long, since auto-captions have no punctuation. */
export const DISPLAY_LINE_MAX_SECONDS = 20;

/** Chunks returned by hybrid search before they're grouped by video. */
export const SEARCH_MATCH_COUNT = 30;

/** Videos whose full transcripts are sent with an "All my videos" question. */
export const TOP_VIDEOS = 3;

/** Reciprocal Rank Fusion constant; higher values flatten the gap between ranks. */
export const RRF_K = 50;

/**
 * Placeholder: a video with no keyword hit needs a chunk at least this similar
 * (cosine, 0 to 1) to count as a match. Tune it against real questions.
 */
export const MIN_SEMANTIC_SIMILARITY = 0.6;

/**
 * A transcript sent with a chat is merged into lines of about this many
 * seconds, each with one timestamp, which saves tokens over one per cue.
 */
export const PROMPT_LINE_SECONDS = 15;

/** Earlier messages sent to Gemini with each new message. */
export const CHAT_HISTORY_LIMIT = 20;

/** Longest chat message accepted, a few pages of text. */
export const MAX_CHAT_MESSAGE_CHARS = 8_000;

/** Titles generated from a chat's first question are cut to this length. */
export const MAX_GENERATED_TITLE_CHARS = 60;

/** Longest title someone can give a chat when renaming it. */
export const MAX_CHAT_TITLE_CHARS = 80;

/**
 * Transcript text sent with a library question, about 50k tokens. Enough for
 * three hour-long videos while staying inside the free tier's per-minute token
 * budget; longer transcripts are cut to excerpts around their matches.
 */
export const MAX_LIBRARY_CONTEXT_CHARS = 200_000;

/** A device stays signed in this long after entering a code. */
export const SESSION_MAX_AGE_DAYS = 30;

/** Codes one IP address can try before it's locked out. */
export const UNLOCK_MAX_ATTEMPTS = 5;

/** How long the last wrong try locks an IP address out, and how long earlier ones count. */
export const UNLOCK_LOCKOUT_MINUTES = 60;

/** Processing that hasn't finished after this long is shown as failed, with a retry. */
export const STALE_PROCESSING_MINUTES = 6;

/**
 * Longest pasted transcript accepted, several hours of speech. Keeps the
 * paste under the 1 MB limit Next.js puts on a server action's request.
 */
export const MAX_PASTED_TRANSCRIPT_CHARS = 500_000;

/** Exported .txt filenames are shortened to this many characters before the extension. */
export const MAX_FILENAME_LENGTH = 120;

/**
 * Size of the embedding vector column. Fixed by the database schema, so
 * changing it needs a migration and a full re-index.
 */
export const EMBEDDING_VECTOR_DIMENSIONS = 768;

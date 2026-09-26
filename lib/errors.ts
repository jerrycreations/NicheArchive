// Every failure the app explains to people, in one table: Gemini, YouTube,
// the database and the server itself. Holds no secrets or server code, so
// client components import it too. lib/ai/errors.ts and lib/youtube/errors.ts
// sort raw errors into these kinds.

export const AI_ERROR_KINDS = [
  "rate_limited",
  "model_not_found",
  "bad_key",
  "blocked",
  "unsupported_input",
  "unknown",
] as const;

export type AiErrorKind = (typeof AI_ERROR_KINDS)[number];

export const YOUTUBE_ERROR_KINDS = [
  "not_found",
  "live_or_upcoming",
  "quota_exceeded",
  "bad_key",
  "network",
  "unexpected",
] as const;

export type YouTubeErrorKind = (typeof YOUTUBE_ERROR_KINDS)[number];

export const AI_ERROR_MESSAGES: Record<AiErrorKind, string> = {
  rate_limited: "Gemini's free limit was reached. Try again in a minute.",
  model_not_found:
    "A Gemini model name in the server settings is missing or no longer available. Check GEMINI_CHAT_MODEL, GEMINI_REWRITE_MODEL and GEMINI_EMBEDDING_MODEL against AI Studio's model list.",
  bad_key:
    "The Gemini API key is missing or isn't valid. Check GOOGLE_GENERATIVE_AI_API_KEY in the server settings.",
  blocked: "Gemini's safety filters blocked this.",
  unsupported_input: "Gemini couldn't use what it was sent.",
  unknown: "Gemini ran into a problem. Try again in a moment.",
};

// Google resets daily quotas at midnight Pacific time.
export const AI_DAILY_LIMIT_MESSAGE =
  "Gemini's free daily limit for this model was reached. It resets at midnight Pacific time.";

export const YOUTUBE_ERROR_MESSAGES: Record<YouTubeErrorKind, string> = {
  not_found: "This video is private or has been deleted.",
  live_or_upcoming: "This stream hasn't finished. Add it after it ends.",
  quota_exceeded: "YouTube's daily lookup limit is used up. Try again tomorrow.",
  bad_key:
    "The YouTube API key is missing or isn't valid. Check YOUTUBE_API_KEY in the server settings.",
  network: "Couldn't reach YouTube. Try again in a moment.",
  unexpected: "YouTube sent a response this app didn't expect. Try again in a moment.",
};

/** Anything on the server that nobody planned for. The real error goes to the server log. */
export const SERVER_PROBLEM = "Something went wrong on the server. Try again.";

/** The request had no valid session cookie, say because it expired or a code changed. */
export const SIGNED_OUT = "You've been signed out. Reload the page and enter your code.";

/** The browser couldn't reach the server at all. */
export const SERVER_UNREACHABLE = "Couldn't reach the server. Check your connection and try again.";

/**
 * The server couldn't reach Postgres. The likeliest cause is Supabase's free
 * tier pausing the project after a week without use, which the daily cron
 * ping is there to prevent.
 */
export const DATABASE_UNREACHABLE =
  "Can't reach the database. If the Supabase project is paused, restore it from the Supabase dashboard.";

// Node's socket errors, and postgres.js's own codes for a connection that
// never opened or went away.
const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
]);

// SQLSTATE class 08 (connection exception), and the server shutting down or
// starting up (57P01 to 57P03).
const CONNECTION_SQLSTATE = /^(08[0-9A-Z]{3}|57P0[1-3])$/;

// Supabase's pooler answers this for a paused project (and for a wrong
// project reference in the connection string).
const PAUSED_PROJECT = /Tenant or user not found/i;

/**
 * Whether `error` means the database couldn't be reached at all, rather than
 * a query going wrong. Looks through `cause` (Drizzle wraps query errors) and
 * through an AggregateError's `errors` (Node tries each address in turn).
 */
export function isDatabaseUnreachable(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) return false;
  const { code, message, cause, errors } = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
    errors?: unknown;
  };
  if (typeof code === "string" && (CONNECTION_CODES.has(code) || CONNECTION_SQLSTATE.test(code))) {
    return true;
  }
  if (typeof message === "string" && PAUSED_PROJECT.test(message)) return true;
  if (Array.isArray(errors) && errors.some((inner) => isDatabaseUnreachable(inner, depth + 1))) {
    return true;
  }
  return isDatabaseUnreachable(cause, depth + 1);
}

/** What to tell the user about an unplanned server failure. */
export function serverErrorMessage(error: unknown): string {
  return isDatabaseUnreachable(error) ? DATABASE_UNREACHABLE : SERVER_PROBLEM;
}

/** The JSON body of a route's error response. `error` is written for the user. */
export type ErrorBody = { error: string };

/**
 * A route's answer to an unplanned failure: logs the real error and answers
 * 503 with the database message when Postgres is unreachable, else 500.
 */
export function serverErrorResponse(context: string, error: unknown): Response {
  console.error(`${context} failed:`, error);
  const unreachable = isDatabaseUnreachable(error);
  return Response.json(
    { error: unreachable ? DATABASE_UNREACHABLE : SERVER_PROBLEM } satisfies ErrorBody,
    { status: unreachable ? 503 : 500, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Runs a page's database reads. When the database can't be reached, returns
 * `{ ok: false }` so the page can say so in words, since Next hides a server
 * error's message in production. Any other error is rethrown for the error
 * boundary, and so are notFound() and redirect().
 */
export async function unlessDatabaseDown<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (!isDatabaseUnreachable(error)) throw error;
    console.error("Can't reach the database:", error);
    return { ok: false };
  }
}

/** The `error` of a JSON error body, or null when the body isn't one. */
export function readErrorBody(body: unknown): string | null {
  const message = (body as Partial<ErrorBody> | null)?.error;
  return typeof message === "string" && message ? message : null;
}

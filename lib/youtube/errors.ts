// Why a YouTube Data API lookup failed, and what to tell the user. Holds no
// secrets or server code, so client components import the messages too.
import { API_KEY_REASONS, errorMessage, errorReasons } from "@/lib/google/error-body";

export const YOUTUBE_ERROR_KINDS = [
  "not_found",
  "live_or_upcoming",
  "quota_exceeded",
  "bad_key",
  "network",
  "unexpected",
] as const;

export type YouTubeErrorKind = (typeof YOUTUBE_ERROR_KINDS)[number];

const MESSAGES: Record<YouTubeErrorKind, string> = {
  not_found: "This video is private or has been deleted.",
  live_or_upcoming: "This stream hasn't finished. Add it after it ends.",
  quota_exceeded: "YouTube's daily lookup limit is used up. Try again tomorrow.",
  bad_key:
    "The YouTube API key is missing or isn't valid. Check YOUTUBE_API_KEY in the server settings.",
  network: "Couldn't reach YouTube. Try again in a moment.",
  unexpected: "YouTube sent a response this app didn't expect. Try again in a moment.",
};

export function youTubeErrorMessage(kind: YouTubeErrorKind): string {
  return MESSAGES[kind];
}

const QUOTA_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);

// Everything that means the key itself is the problem: invalid or expired,
// restricted to other APIs, callers or referrers, or the API not enabled.
// The first five are the Data API's older reasons.
const BAD_KEY_REASONS = new Set<string>([
  "keyInvalid",
  "keyExpired",
  "forbidden",
  "accessNotConfigured",
  "ipRefererBlocked",
  ...API_KEY_REASONS,
]);

/** Sorts a failed Data API response into a kind, by the reasons in its error body. */
export function classifyApiError(status: number, body: unknown): YouTubeErrorKind {
  const reasons = errorReasons(body);
  if (status === 403 && reasons.some((reason) => QUOTA_REASONS.has(reason))) {
    return "quota_exceeded";
  }
  if (
    (status === 400 || status === 403) &&
    reasons.some((reason) => BAD_KEY_REASONS.has(reason))
  ) {
    return "bad_key";
  }
  return "unexpected";
}

/** A failed response in one line for the server logs, e.g. `HTTP 403 quotaExceeded: The request cannot…`. */
export function describeApiError(status: number, body: unknown): string {
  const message = errorMessage(body) ?? "";
  return [`HTTP ${status}`, ...new Set(errorReasons(body))].join(" ") + (message && `: ${message}`);
}

// Why a YouTube Data API lookup failed, and what to tell the user. Holds no
// secrets or server code, so client components import the messages too. The
// kinds and their messages live in lib/errors.ts.
import { YOUTUBE_ERROR_MESSAGES, type YouTubeErrorKind } from "@/lib/errors";
import { API_KEY_REASONS, errorMessage, errorReasons } from "@/lib/google/error-body";

export { YOUTUBE_ERROR_KINDS, type YouTubeErrorKind } from "@/lib/errors";

export function youTubeErrorMessage(kind: YouTubeErrorKind): string {
  return YOUTUBE_ERROR_MESSAGES[kind];
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

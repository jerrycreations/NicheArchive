// Why a YouTube Data API lookup failed, and what to tell the user. Holds no
// secrets or server code, so client components import the messages too.

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
const BAD_KEY_REASONS = new Set([
  "keyInvalid",
  "keyExpired",
  "forbidden",
  "accessNotConfigured",
  "ipRefererBlocked",
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "SERVICE_DISABLED",
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
  const error = isRecord(body) ? body.error : undefined;
  const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
  return [`HTTP ${status}`, ...new Set(errorReasons(body))].join(" ") + (message && `: ${message}`);
}

/**
 * Google's error bodies carry reasons in two places: `error.errors[].reason`
 * in the older format, and ErrorInfo entries in `error.details[]` in the
 * current one. An invalid key now reads "badRequest" in the first and
 * "API_KEY_INVALID" in the second, so both are checked.
 */
function errorReasons(body: unknown): string[] {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) return [];
  return [error.errors, error.details]
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .map((entry) => (isRecord(entry) ? entry.reason : undefined))
    .filter((reason): reason is string => typeof reason === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

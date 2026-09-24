// Google's APIs (the YouTube Data API, Gemini) answer errors with the same
// JSON body: { error: { code, message, status, errors?: [...], details?: [...] } }.
// These read it defensively, since any part may be missing.

/** ErrorInfo reasons meaning the API key itself is the problem, in any Google API. */
export const API_KEY_REASONS = [
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "SERVICE_DISABLED",
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorObject(body: unknown): Record<string, unknown> | undefined {
  const error = isRecord(body) ? body.error : undefined;
  return isRecord(error) ? error : undefined;
}

/**
 * The reasons in an error body. They sit in two places: `error.errors[].reason`
 * in the older format, and ErrorInfo entries in `error.details[]` in the
 * current one. An invalid YouTube key now reads "badRequest" in the first and
 * "API_KEY_INVALID" in the second, so both are read.
 */
export function errorReasons(body: unknown): string[] {
  const error = errorObject(body);
  if (!error) return [];
  return [error.errors, error.details]
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .map((entry) => (isRecord(entry) ? entry.reason : undefined))
    .filter((reason): reason is string => typeof reason === "string");
}

/** The canonical status, such as RESOURCE_EXHAUSTED or INVALID_ARGUMENT. */
export function errorStatus(body: unknown): string | undefined {
  const status = errorObject(body)?.status;
  return typeof status === "string" ? status : undefined;
}

export function errorMessage(body: unknown): string | undefined {
  const message = errorObject(body)?.message;
  return typeof message === "string" ? message : undefined;
}

/** Seconds from a RetryInfo entry's `retryDelay`, such as "37s" or "1.5s", rounded up. */
export function retryDelaySeconds(body: unknown): number | undefined {
  const details = errorObject(body)?.details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    const delay = isRecord(detail) ? detail.retryDelay : undefined;
    const match = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
    if (match) return Math.ceil(Number(match[1]));
  }
  return undefined;
}

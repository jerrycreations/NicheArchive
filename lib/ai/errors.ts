// Why a Gemini call failed, and what to tell the user. The kinds and their
// messages live with the app's other failures in lib/errors.ts.
import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { AI_DAILY_LIMIT_MESSAGE, AI_ERROR_MESSAGES, type AiErrorKind } from "@/lib/errors";
import {
  API_KEY_REASONS,
  errorReasons,
  errorStatus,
  exceededQuotaIds,
  retryDelaySeconds,
} from "@/lib/google/error-body";

export { AI_ERROR_KINDS, type AiErrorKind } from "@/lib/errors";

export type AiError =
  | {
      kind: "rate_limited";
      retryAfterSeconds?: number;
      /** The free tier's requests per day ran out, not its per minute. */
      daily?: boolean;
    }
  | { kind: Exclude<AiErrorKind, "rate_limited"> };

export function aiErrorMessage(kind: AiErrorKind): string {
  return AI_ERROR_MESSAGES[kind];
}

/**
 * What to tell the user about a classified error. Unlike aiErrorMessage,
 * it tells a used-up daily limit apart, where waiting a minute won't help.
 */
export function aiErrorText(error: AiError): string {
  return error.kind === "rate_limited" && error.daily
    ? AI_DAILY_LIMIT_MESSAGE
    : AI_ERROR_MESSAGES[error.kind];
}

/**
 * Thrown before calling Gemini when the server settings can't work: the API
 * key or a model name isn't set.
 */
export class AiConfigError extends Error {
  constructor(
    readonly kind: "bad_key" | "model_not_found",
    message: string,
  ) {
    super(message);
    this.name = "AiConfigError";
  }
}

const KEY_REASONS = new Set<string>(API_KEY_REASONS);

/**
 * Sorts an error from a Gemini call into a kind. Looks through the SDK's
 * retry wrapper to the last attempt, and reads Google's error body for the
 * status, reasons and suggested retry delay.
 */
export function classifyAiError(error: unknown): AiError {
  if (RetryError.isInstance(error)) return classifyAiError(error.lastError);
  if (error instanceof AiConfigError) return { kind: error.kind };
  if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "content-filter") {
    return { kind: "blocked" };
  }
  if (APICallError.isInstance(error)) return classifyApiCallError(error);
  return { kind: "unknown" };
}

function classifyApiCallError(error: APICallError): AiError {
  const body = error.data ?? parseJson(error.responseBody);
  const status = errorStatus(body);
  const code = error.statusCode;

  if (code === 429 || status === "RESOURCE_EXHAUSTED") {
    const retryAfterSeconds =
      retryAfterHeaderSeconds(error.responseHeaders) ?? retryDelaySeconds(body);
    const daily = exceededQuotaIds(body).some((quotaId) => /PerDay/i.test(quotaId));
    return {
      kind: "rate_limited",
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      ...(daily ? { daily } : {}),
    };
  }
  // An invalid key comes back as a 400 INVALID_ARGUMENT, so this goes first.
  if (
    code === 401 ||
    status === "UNAUTHENTICATED" ||
    errorReasons(body).some((reason) => KEY_REASONS.has(reason)) ||
    /API key/i.test(error.message)
  ) {
    return { kind: "bad_key" };
  }
  if (code === 404 || status === "NOT_FOUND") return { kind: "model_not_found" };
  // Anything else Gemini refuses to take, such as a video it can't open.
  if (
    code === 400 ||
    code === 403 ||
    status === "INVALID_ARGUMENT" ||
    status === "PERMISSION_DENIED" ||
    status === "FAILED_PRECONDITION"
  ) {
    return { kind: "unsupported_input" };
  }
  return { kind: "unknown" };
}

/** `Retry-After` in seconds, or as an HTTP date. */
function retryAfterHeaderSeconds(headers: Record<string, string> | undefined): number | undefined {
  const value = headers?.["retry-after"]?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function parseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

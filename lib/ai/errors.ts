// Why a Gemini call failed, and what to tell the user.
import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import {
  API_KEY_REASONS,
  errorReasons,
  errorStatus,
  retryDelaySeconds,
} from "@/lib/google/error-body";

export const AI_ERROR_KINDS = [
  "rate_limited",
  "model_not_found",
  "bad_key",
  "blocked",
  "unsupported_input",
  "unknown",
] as const;

export type AiErrorKind = (typeof AI_ERROR_KINDS)[number];

export type AiError =
  | { kind: "rate_limited"; retryAfterSeconds?: number }
  | { kind: Exclude<AiErrorKind, "rate_limited"> };

const MESSAGES: Record<AiErrorKind, string> = {
  rate_limited: "Gemini's free limit was reached. Try again in a minute.",
  model_not_found:
    "A Gemini model name in the server settings is missing or no longer available. Check GEMINI_CHAT_MODEL, GEMINI_REWRITE_MODEL and GEMINI_EMBEDDING_MODEL against AI Studio's model list.",
  bad_key:
    "The Gemini API key is missing or isn't valid. Check GOOGLE_GENERATIVE_AI_API_KEY in the server settings.",
  blocked: "Gemini's safety filters blocked this.",
  unsupported_input: "Gemini couldn't use what it was sent.",
  unknown: "Gemini ran into a problem. Try again in a moment.",
};

export function aiErrorMessage(kind: AiErrorKind): string {
  return MESSAGES[kind];
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
    return retryAfterSeconds === undefined
      ? { kind: "rate_limited" }
      : { kind: "rate_limited", retryAfterSeconds };
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

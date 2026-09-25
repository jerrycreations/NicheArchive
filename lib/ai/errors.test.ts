import { APICallError, NoObjectGeneratedError, RetryError, type LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { AiConfigError, aiErrorMessage, aiErrorText, classifyAiError } from "./errors";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

/** An error as the Google provider builds it from a failed response. */
function googleError(
  statusCode: number,
  error: { status: string; message: string; details?: unknown[] },
  responseHeaders?: Record<string, string>,
) {
  const body = { error: { code: statusCode, ...error } };
  return new APICallError({
    message: error.message,
    url: ENDPOINT,
    requestBodyValues: {},
    statusCode,
    responseHeaders,
    responseBody: JSON.stringify(body),
    data: body,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

const errorInfo = (reason: string) => ({
  "@type": "type.googleapis.com/google.rpc.ErrorInfo",
  reason,
  domain: "googleapis.com",
});

const quotaExceeded = (details: unknown[] = []) =>
  googleError(429, {
    status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota, please check your plan and billing details.",
    details,
  });

describe("classifyAiError", () => {
  it("reads the retry delay from Google's RetryInfo", () => {
    const error = quotaExceeded([
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "36.5s" },
    ]);
    expect(classifyAiError(error)).toEqual({ kind: "rate_limited", retryAfterSeconds: 37 });
  });

  it("tells a used-up daily quota from a per-minute one", () => {
    const quotaFailure = (quotaId: string) => ({
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [
        {
          quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          quotaId,
          quotaValue: "20",
        },
      ],
    });
    const retryInfo = { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "38s" };

    expect(
      classifyAiError(
        quotaExceeded([quotaFailure("GenerateRequestsPerDayPerProjectPerModel-FreeTier"), retryInfo]),
      ),
    ).toEqual({ kind: "rate_limited", retryAfterSeconds: 38, daily: true });
    expect(
      classifyAiError(quotaExceeded([quotaFailure("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")])),
    ).toEqual({ kind: "rate_limited" });
  });

  it("prefers a Retry-After header", () => {
    const error = googleError(
      429,
      { status: "RESOURCE_EXHAUSTED", message: "Too many requests." },
      { "retry-after": "12" },
    );
    expect(classifyAiError(error)).toEqual({ kind: "rate_limited", retryAfterSeconds: 12 });
  });

  it("reports a rate limit without a delay when Google gives none", () => {
    expect(classifyAiError(quotaExceeded())).toEqual({ kind: "rate_limited" });
  });

  it("looks through the SDK's retry wrapper to the last attempt", () => {
    const retried = new RetryError({
      message: "Failed after 3 attempts.",
      reason: "maxRetriesExceeded",
      errors: [new Error("socket hang up"), quotaExceeded(), quotaExceeded()],
    });
    expect(classifyAiError(retried)).toEqual({ kind: "rate_limited" });
  });

  it("recognizes a model name Google doesn't know", () => {
    const error = googleError(404, {
      status: "NOT_FOUND",
      message: "models/gemini-9-flash is not found for API version v1beta.",
    });
    expect(classifyAiError(error)).toEqual({ kind: "model_not_found" });
  });

  it.each([
    [
      "an invalid key",
      googleError(400, {
        status: "INVALID_ARGUMENT",
        message: "API key not valid. Please pass a valid API key.",
        details: [errorInfo("API_KEY_INVALID")],
      }),
    ],
    [
      "a key restricted to other APIs",
      googleError(403, {
        status: "PERMISSION_DENIED",
        message: "Requests to this API are blocked.",
        details: [errorInfo("API_KEY_SERVICE_BLOCKED")],
      }),
    ],
    [
      "an invalid key without details",
      googleError(400, {
        status: "INVALID_ARGUMENT",
        message: "API key not valid. Please pass a valid API key.",
      }),
    ],
    ["a missing key setting", new AiConfigError("bad_key", "GOOGLE_GENERATIVE_AI_API_KEY is missing")],
  ])("reports a bad key for %s", (_, error) => {
    expect(classifyAiError(error)).toEqual({ kind: "bad_key" });
  });

  it("reports a missing model setting as model_not_found", () => {
    const error = new AiConfigError("model_not_found", "GEMINI_CHAT_MODEL is missing");
    expect(classifyAiError(error)).toEqual({ kind: "model_not_found" });
  });

  it("reports input Gemini refuses as unsupported", () => {
    const error = googleError(400, {
      status: "INVALID_ARGUMENT",
      message: "Request contains an invalid argument.",
    });
    expect(classifyAiError(error)).toEqual({ kind: "unsupported_input" });
  });

  it("reports an answer stopped by the safety filters as blocked", () => {
    const error = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      text: "",
      response: { id: "response-1", timestamp: new Date(0), modelId: "gemini-3.8-flash" },
      usage: {} as LanguageModelUsage,
      finishReason: "content-filter",
    });
    expect(classifyAiError(error)).toEqual({ kind: "blocked" });
  });

  it.each([
    ["a server error", googleError(500, { status: "INTERNAL", message: "Internal error." })],
    ["an overloaded model", googleError(503, { status: "UNAVAILABLE", message: "Overloaded." })],
    ["a plain error", new Error("socket hang up")],
    ["a thrown string", "boom"],
  ])("reports %s as unknown", (_, error) => {
    expect(classifyAiError(error)).toEqual({ kind: "unknown" });
  });
});

describe("aiErrorMessage", () => {
  it("tells the user to wait a minute when the free limit is reached", () => {
    expect(aiErrorMessage("rate_limited")).toBe(
      "Gemini's free limit was reached. Try again in a minute.",
    );
  });

  it("says when a daily limit resets, instead of waiting a minute", () => {
    expect(aiErrorText({ kind: "rate_limited", daily: true })).toBe(
      "Gemini's free daily limit for this model was reached. It resets at midnight Pacific time.",
    );
    expect(aiErrorText({ kind: "rate_limited", retryAfterSeconds: 20 })).toBe(
      aiErrorMessage("rate_limited"),
    );
    expect(aiErrorText({ kind: "blocked" })).toBe(aiErrorMessage("blocked"));
  });

  it("names the setting to check for a bad key", () => {
    expect(aiErrorMessage("bad_key")).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });
});

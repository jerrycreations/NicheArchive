import { describe, expect, it } from "vitest";
import { errorMessage, errorReasons, errorStatus, retryDelaySeconds } from "./error-body";

const body = {
  error: {
    code: 429,
    message: "You exceeded your current quota.",
    status: "RESOURCE_EXHAUSTED",
    errors: [{ reason: "rateLimitExceeded" }],
    details: [
      { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "RATE_LIMIT_EXCEEDED" },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7s" },
    ],
  },
};

describe("Google error bodies", () => {
  it("reads the status, message and reasons from both places", () => {
    expect(errorStatus(body)).toBe("RESOURCE_EXHAUSTED");
    expect(errorMessage(body)).toBe("You exceeded your current quota.");
    expect(errorReasons(body)).toEqual(["rateLimitExceeded", "RATE_LIMIT_EXCEEDED"]);
  });

  it.each([
    ["7s", 7],
    ["1.2s", 2],
    ["0s", 0],
  ])("reads a retryDelay of %s as %i seconds", (retryDelay, seconds) => {
    expect(retryDelaySeconds({ error: { details: [{ retryDelay }] } })).toBe(seconds);
  });

  it.each([null, "not json", {}, { error: "text" }, { error: { details: "x" } }])(
    "reads nothing from %j",
    (value) => {
      expect(errorStatus(value)).toBeUndefined();
      expect(errorMessage(value)).toBeUndefined();
      expect(errorReasons(value)).toEqual([]);
      expect(retryDelaySeconds(value)).toBeUndefined();
    },
  );
});

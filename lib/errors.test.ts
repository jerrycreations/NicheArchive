import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATABASE_UNREACHABLE,
  isDatabaseUnreachable,
  readErrorBody,
  SERVER_PROBLEM,
  serverErrorMessage,
  serverErrorResponse,
  unlessDatabaseDown,
} from "./errors";

/** An error shaped like Node's and postgres.js's, which carry a `code`. */
function codedError(code: string, message = `failed: ${code}`): Error {
  return Object.assign(new Error(message), { code });
}

/** How Drizzle reports a failed query: its own error, with the driver's as the cause. */
function drizzleError(cause: unknown): Error {
  return new Error("Failed query: select 1\nparams: ", { cause });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isDatabaseUnreachable", () => {
  it.each([
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
    "08006",
    "08001",
    "57P01",
    "57P03",
  ])("counts %s", (code) => {
    expect(isDatabaseUnreachable(codedError(code))).toBe(true);
  });

  it("counts Supabase's answer for a paused project", () => {
    const error = codedError("XX000", "Tenant or user not found");
    expect(isDatabaseUnreachable(error)).toBe(true);
  });

  it("looks through Drizzle's wrapper to the cause", () => {
    expect(isDatabaseUnreachable(drizzleError(codedError("ECONNREFUSED")))).toBe(true);
  });

  it("looks inside an AggregateError from trying several addresses", () => {
    const error = new AggregateError([codedError("ECONNREFUSED"), codedError("ECONNREFUSED")]);
    expect(isDatabaseUnreachable(error)).toBe(true);
  });

  it.each([
    ["a failed query", drizzleError(codedError("23505", "duplicate key value"))],
    ["a wrong password", codedError("28P01", "password authentication failed")],
    ["a plain error", new Error("boom")],
    ["a string", "ECONNREFUSED"],
    ["nothing", undefined],
  ])("doesn't count %s", (_label, error) => {
    expect(isDatabaseUnreachable(error)).toBe(false);
  });

  it("stops following a cause that loops", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(isDatabaseUnreachable(error)).toBe(false);
  });
});

describe("serverErrorMessage", () => {
  it("names the database when it's unreachable, else stays generic", () => {
    expect(serverErrorMessage(codedError("ECONNREFUSED"))).toBe(DATABASE_UNREACHABLE);
    expect(serverErrorMessage(new Error("boom"))).toBe(SERVER_PROBLEM);
  });
});

describe("serverErrorResponse", () => {
  it("answers 503 with the database message when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = serverErrorResponse("GET /test", codedError("CONNECT_TIMEOUT"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: DATABASE_UNREACHABLE });
  });

  it("answers 500 for anything else and logs the real error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    const response = serverErrorResponse("GET /test", error);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: SERVER_PROBLEM });
    expect(log).toHaveBeenCalledWith("GET /test failed:", error);
  });
});

describe("unlessDatabaseDown", () => {
  it("passes the value through", async () => {
    await expect(unlessDatabaseDown(async () => 42)).resolves.toEqual({ ok: true, value: 42 });
  });

  it("reports an unreachable database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      unlessDatabaseDown(() => Promise.reject(drizzleError(codedError("ECONNREFUSED")))),
    ).resolves.toEqual({ ok: false });
  });

  it("rethrows anything else", async () => {
    const error = new Error("boom");
    await expect(unlessDatabaseDown(() => Promise.reject(error))).rejects.toBe(error);
  });
});

describe("readErrorBody", () => {
  it("reads the error message of a JSON error body", () => {
    expect(readErrorBody({ error: "Nope." })).toBe("Nope.");
  });

  it.each([null, {}, { error: "" }, { error: 42 }, "Nope."])("is null for %j", (body) => {
    expect(readErrorBody(body)).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID = {
  DATABASE_URL:
    "postgresql://postgres.abc:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  APP_PASSCODES: "Alex:correct horse battery staple, Sam : purple monkey dishwasher ",
  AUTH_SECRET: "s".repeat(32),
  YOUTUBE_API_KEY: "yt-key",
  GOOGLE_GENERATIVE_AI_API_KEY: "gemini-key",
  GEMINI_CHAT_MODEL: "gemini-3.8-flash",
  GEMINI_REWRITE_MODEL: "gemini-3.5-flash-lite",
  GEMINI_EMBEDDING_MODEL: "gemini-embedding-2",
  EMBEDDING_DIMENSIONS: "768",
  CRON_SECRET: "cron-secret",
};

function stubEnv(overrides: Partial<Record<keyof typeof VALID, string>> = {}) {
  for (const [key, value] of Object.entries({ ...VALID, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

// A fresh module per test, since env() caches its first successful result.
async function loadEnv() {
  return (await import("./env")).env;
}

async function loadEnvPick() {
  return (await import("./env")).envPick;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("parses a complete environment", async () => {
    stubEnv();
    const env = await loadEnv();
    expect(env()).toMatchObject({
      DATABASE_URL: VALID.DATABASE_URL,
      YOUTUBE_API_KEY: VALID.YOUTUBE_API_KEY,
      EMBEDDING_DIMENSIONS: 768,
    });
  });

  it("reads APP_PASSCODES as trimmed names and codes", async () => {
    stubEnv();
    const env = await loadEnv();
    expect(env().APP_PASSCODES).toEqual([
      { name: "Alex", code: "correct horse battery staple" },
      { name: "Sam", code: "purple monkey dishwasher" },
    ]);
  });

  it("keeps everything after a name's colon as the code", async () => {
    stubEnv({ APP_PASSCODES: "Alex:with:colons:inside" });
    const env = await loadEnv();
    expect(env().APP_PASSCODES).toEqual([{ name: "Alex", code: "with:colons:inside" }]);
  });

  it.each([
    ["an entry without a colon", "Alex:correct horse battery staple,Sam", "must be Name:code pairs separated by commas"],
    ["a blank name", ":correct horse battery staple", "must be Name:code pairs separated by commas"],
    ["a trailing comma", "Alex:correct horse battery staple,", "must be Name:code pairs separated by commas"],
    ["a short code", "Alex:correct horse battery staple,Sam:1234567", "needs a code of at least 8 characters for Sam"],
    ["a name twice", "Alex:correct horse battery staple,alex:purple monkey dishwasher", "lists alex twice"],
    ["two people with one code", "Alex:correct horse battery staple,Sam:correct horse battery staple", "gives two people the same code"],
  ])("rejects APP_PASSCODES with %s, without showing a code", async (_, value, message) => {
    stubEnv({ APP_PASSCODES: value });
    const env = await loadEnv();
    let error = "";
    try {
      env();
    } catch (thrown) {
      error = (thrown as Error).message;
    }
    expect(error).toContain(`APP_PASSCODES ${message}`);
    expect(error).not.toContain("correct horse");
    expect(error).not.toContain("1234567");
  });

  it("wants AUTH_SECRET to be at least 32 characters", async () => {
    stubEnv({ AUTH_SECRET: "s".repeat(31) });
    const env = await loadEnv();
    expect(env).toThrow(/AUTH_SECRET must be at least 32 characters/);
  });

  it("names every missing or invalid key in one error", async () => {
    stubEnv({
      DATABASE_URL: "https://example.com",
      GOOGLE_GENERATIVE_AI_API_KEY: "",
      EMBEDDING_DIMENSIONS: "767",
      CRON_SECRET: "   ",
    });
    const env = await loadEnv();
    let message = "";
    try {
      env();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL must be a postgres:// connection string");
    expect(message).toContain("GOOGLE_GENERATIVE_AI_API_KEY is missing");
    expect(message).toContain("EMBEDDING_DIMENSIONS must be 768");
    expect(message).toContain("CRON_SECRET is missing");
    expect(message).not.toContain("YOUTUBE_API_KEY");
  });

  it("reports a blank value once, as missing", async () => {
    stubEnv({ DATABASE_URL: "" });
    const env = await loadEnv();
    expect(env).toThrow(/DATABASE_URL is missing/);
    expect(env).not.toThrow(/postgres:\/\/ connection string/);
  });

  it("caches the first successful result", async () => {
    stubEnv();
    const env = await loadEnv();
    const first = env();
    vi.stubEnv("YOUTUBE_API_KEY", "");
    expect(env()).toBe(first);
  });
});

describe("envPick", () => {
  it("returns only the named keys and ignores other blank ones", async () => {
    stubEnv({ YOUTUBE_API_KEY: "", GOOGLE_GENERATIVE_AI_API_KEY: "" });
    const envPick = await loadEnvPick();
    expect(envPick("DATABASE_URL", "CRON_SECRET")).toEqual({
      DATABASE_URL: VALID.DATABASE_URL,
      CRON_SECRET: VALID.CRON_SECRET,
    });
  });

  it("names only the named keys that are missing or invalid", async () => {
    stubEnv({ DATABASE_URL: "mysql://nope", CRON_SECRET: "", YOUTUBE_API_KEY: "" });
    const envPick = await loadEnvPick();
    let message = "";
    try {
      envPick("DATABASE_URL", "CRON_SECRET");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL must be a postgres:// connection string");
    expect(message).toContain("CRON_SECRET is missing");
    expect(message).not.toContain("YOUTUBE_API_KEY");
  });
});

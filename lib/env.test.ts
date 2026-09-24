import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID = {
  DATABASE_URL:
    "postgresql://postgres.abc:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
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

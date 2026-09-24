import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "./session";

const PASSCODE = "correct horse battery staple";
const SECRET = "s".repeat(32);
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 24, 12);

function decodePayload(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
}

function withPayload(token: string, payload: unknown) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${token.split(".")[1]}`;
}

beforeEach(() => {
  vi.stubEnv("APP_PASSCODE", PASSCODE);
  vi.stubEnv("AUTH_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("accepts a token it just made", async () => {
    const token = await createSessionToken(NOW);
    expect(await verifySessionToken(token, NOW)).toBe(true);
  });

  it("holds the unlock time in seconds and no passcode", async () => {
    const token = await createSessionToken(NOW);
    const payload = decodePayload(token);
    expect(payload.iat).toBe(NOW / 1000);
    expect(token).not.toContain(PASSCODE);
    expect(JSON.stringify(payload)).not.toContain(PASSCODE);
  });

  it("accepts a token until it is 30 days old", async () => {
    const token = await createSessionToken(NOW);
    expect(await verifySessionToken(token, NOW + 30 * DAY_MS - 1000)).toBe(true);
    expect(await verifySessionToken(token, NOW + 30 * DAY_MS)).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await createSessionToken(NOW - 60 * DAY_MS);
    const payload = decodePayload(token);
    const renewed = withPayload(token, { ...payload, iat: NOW / 1000 });
    expect(await verifySessionToken(renewed, NOW)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken(NOW);
    const [payload, signature] = token.split(".");
    // The first character carries six full bits; the last is partly padding.
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(await verifySessionToken(`${payload}.${flipped}`, NOW)).toBe(false);
  });

  it("rejects every token once the passcode changes", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("APP_PASSCODE", "a brand new passcode");
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });

  it("rejects every token once AUTH_SECRET changes", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("AUTH_SECRET", "t".repeat(32));
    expect(await verifySessionToken(token, NOW)).toBe(false);
  });

  it("allows a minute of clock drift but no more", async () => {
    const slightlyAhead = await createSessionToken(NOW + 30_000);
    expect(await verifySessionToken(slightlyAhead, NOW)).toBe(true);
    const fromTheFuture = await createSessionToken(NOW + 5 * 60_000);
    expect(await verifySessionToken(fromTheFuture, NOW)).toBe(false);
  });

  it.each(["", "abc", "a.b.c", "!!!.???", "abc.", ".abc", "a.b"])(
    "rejects the malformed token %j",
    async (token) => {
      expect(await verifySessionToken(token, NOW)).toBe(false);
    },
  );

  it("throws, rather than letting anyone in, when the secrets are missing", async () => {
    const token = await createSessionToken(NOW);
    vi.stubEnv("APP_PASSCODE", "");
    vi.stubEnv("AUTH_SECRET", "");
    await expect(verifySessionToken(token, NOW)).rejects.toThrow(
      /APP_PASSCODE is missing[\s\S]*AUTH_SECRET is missing/,
    );
  });
});

describe("sessionCookieOptions", () => {
  it("keeps the cookie away from scripts for 30 days", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it("marks the cookie secure only in production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});

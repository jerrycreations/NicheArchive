import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from "./session";

const ALEX = "correct horse battery staple";
const SAM = "purple monkey dishwasher";
const PEOPLE = `Alex:${ALEX},Sam:${SAM}`;
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
  vi.stubEnv("APP_PASSCODES", PEOPLE);
  vi.stubEnv("AUTH_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("accepts a token it just made, for the person it was made for", async () => {
    expect(await verifySessionToken(await createSessionToken("Alex", NOW), NOW)).toEqual({
      person: "Alex",
    });
    expect(await verifySessionToken(await createSessionToken("Sam", NOW), NOW)).toEqual({
      person: "Sam",
    });
  });

  it("refuses to make a token for someone not in APP_PASSCODES", async () => {
    await expect(createSessionToken("Mallory", NOW)).rejects.toThrow(
      "Mallory isn't in APP_PASSCODES.",
    );
  });

  it("holds the unlock time in seconds and the name, but no code", async () => {
    const token = await createSessionToken("Alex", NOW);
    const payload = decodePayload(token);
    expect(payload.iat).toBe(NOW / 1000);
    expect(payload.sub).toBe("Alex");
    expect(token).not.toContain(ALEX);
    expect(JSON.stringify(payload)).not.toContain(ALEX);
  });

  it("accepts a token until it is 30 days old", async () => {
    const token = await createSessionToken("Alex", NOW);
    expect(await verifySessionToken(token, NOW + 30 * DAY_MS - 1000)).not.toBeNull();
    expect(await verifySessionToken(token, NOW + 30 * DAY_MS)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await createSessionToken("Alex", NOW - 60 * DAY_MS);
    const payload = decodePayload(token);
    const renewed = withPayload(token, { ...payload, iat: NOW / 1000 });
    expect(await verifySessionToken(renewed, NOW)).toBeNull();
  });

  it("rejects a token whose name was swapped for someone else's", async () => {
    const token = await createSessionToken("Alex", NOW);
    const payload = decodePayload(token);
    expect(await verifySessionToken(withPayload(token, { ...payload, sub: "Sam" }), NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken("Alex", NOW);
    const [payload, signature] = token.split(".");
    // The first character carries six full bits; the last is partly padding.
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(await verifySessionToken(`${payload}.${flipped}`, NOW)).toBeNull();
  });

  it("signs out only the person whose code changes", async () => {
    const alex = await createSessionToken("Alex", NOW);
    const sam = await createSessionToken("Sam", NOW);
    vi.stubEnv("APP_PASSCODES", `Alex:a brand new code,Sam:${SAM}`);
    expect(await verifySessionToken(alex, NOW)).toBeNull();
    expect(await verifySessionToken(sam, NOW)).toEqual({ person: "Sam" });
  });

  it("signs out someone removed from APP_PASSCODES", async () => {
    const sam = await createSessionToken("Sam", NOW);
    vi.stubEnv("APP_PASSCODES", `Alex:${ALEX}`);
    expect(await verifySessionToken(sam, NOW)).toBeNull();
  });

  it("rejects every token once AUTH_SECRET changes", async () => {
    const token = await createSessionToken("Alex", NOW);
    vi.stubEnv("AUTH_SECRET", "t".repeat(32));
    expect(await verifySessionToken(token, NOW)).toBeNull();
  });

  it("allows a minute of clock drift but no more", async () => {
    const slightlyAhead = await createSessionToken("Alex", NOW + 30_000);
    expect(await verifySessionToken(slightlyAhead, NOW)).not.toBeNull();
    const fromTheFuture = await createSessionToken("Alex", NOW + 5 * 60_000);
    expect(await verifySessionToken(fromTheFuture, NOW)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", "!!!.???", "abc.", ".abc", "a.b"])(
    "rejects the malformed token %j",
    async (token) => {
      expect(await verifySessionToken(token, NOW)).toBeNull();
    },
  );

  it("throws, rather than letting anyone in, when the secrets are missing", async () => {
    const token = await createSessionToken("Alex", NOW);
    vi.stubEnv("APP_PASSCODES", "");
    vi.stubEnv("AUTH_SECRET", "");
    await expect(verifySessionToken(token, NOW)).rejects.toThrow(
      /APP_PASSCODES is missing[\s\S]*AUTH_SECRET is missing/,
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

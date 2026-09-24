import "server-only";
import { z } from "zod";
import {
  fromBase64Url,
  hmacSign,
  hmacVerify,
  toBase64Url,
} from "@/lib/auth/crypto";
import { SESSION_MAX_AGE_DAYS } from "@/lib/constants";
import { envPick } from "@/lib/env";

// A session token is base64url(payload).base64url(HMAC of the first part),
// signed with AUTH_SECRET. No accounts, so the payload only says when the
// device was unlocked and under which passcode.

export const SESSION_COOKIE = "na_session";

const MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

/** Allows for clock drift between the server that signed a token and the one checking it. */
const CLOCK_SKEW_SECONDS = 60;

/** Enough of the passcode's MAC to notice when the passcode changes. */
const PASSCODE_VERSION_BYTES = 8;

const payloadSchema = z.object({
  /** Unlock time, in seconds since the epoch. */
  iat: z.int(),
  /** Passcode version; see passcodeVersion(). */
  pv: z.string(),
});

type SessionPayload = z.infer<typeof payloadSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const { APP_PASSCODE, AUTH_SECRET } = authEnv();
  const payload: SessionPayload = {
    iat: Math.floor(now / 1000),
    pv: await passcodeVersion(AUTH_SECRET, APP_PASSCODE),
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(AUTH_SECRET, "session", encoded);
  return `${encoded}.${toBase64Url(signature)}`;
}

/**
 * True for a token this app signed less than SESSION_MAX_AGE_DAYS ago under
 * the current passcode. The signature is checked before anything is parsed.
 */
export async function verifySessionToken(
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const { APP_PASSCODE, AUTH_SECRET } = authEnv();

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encoded, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return false;
  if (!(await hmacVerify(AUTH_SECRET, "session", encoded, signatureBytes))) {
    return false;
  }

  const payload = parsePayload(encoded);
  if (!payload) return false;
  const age = Math.floor(now / 1000) - payload.iat;
  if (age < -CLOCK_SKEW_SECONDS || age >= MAX_AGE_SECONDS) return false;
  return payload.pv === (await passcodeVersion(AUTH_SECRET, APP_PASSCODE));
}

// Validated together so a missing-key error names both.
function authEnv() {
  return envPick("APP_PASSCODE", "AUTH_SECRET");
}

// Changes whenever the passcode does, so a new passcode signs out every
// device. Keyed rather than a plain hash, so someone holding a cookie can't
// test passcode guesses offline.
async function passcodeVersion(secret: string, passcode: string) {
  const mac = await hmacSign(secret, "passcode-version", passcode);
  return toBase64Url(mac.slice(0, PASSCODE_VERSION_BYTES));
}

function parsePayload(encoded: string): SessionPayload | null {
  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;
  try {
    const result = payloadSchema.safeParse(JSON.parse(decoder.decode(bytes)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

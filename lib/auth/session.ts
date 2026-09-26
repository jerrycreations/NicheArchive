import "server-only";
import { z } from "zod";
import {
  fromBase64Url,
  hmacSign,
  hmacVerify,
  toBase64Url,
} from "@/lib/auth/crypto";
import { SESSION_MAX_AGE_DAYS } from "@/lib/constants";
import { envPick, type Person } from "@/lib/env";

// A session token is base64url(payload).base64url(HMAC of the first part),
// signed with AUTH_SECRET. There are no accounts: the payload says who
// signed in, when, and under which version of their code.

export const SESSION_COOKIE = "na_session";

const MAX_AGE_SECONDS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

/** Allows for clock drift between the server that signed a token and the one checking it. */
const CLOCK_SKEW_SECONDS = 60;

/** Enough of the code's MAC to notice when the code changes. */
const PASSCODE_VERSION_BYTES = 8;

/** Who a signed-in device belongs to: a name from APP_PASSCODES. */
export type Session = { person: string };

const payloadSchema = z.object({
  /** Unlock time, in seconds since the epoch. */
  iat: z.int(),
  /** The person's name. */
  sub: z.string(),
  /** Their code's version; see passcodeVersion(). */
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

/** A token for `name`, who must be in APP_PASSCODES. */
export async function createSessionToken(name: string, now = Date.now()): Promise<string> {
  const { APP_PASSCODES, AUTH_SECRET } = authEnv();
  const person = APP_PASSCODES.find((candidate) => candidate.name === name);
  if (!person) throw new Error(`${name} isn't in APP_PASSCODES.`);

  const payload: SessionPayload = {
    iat: Math.floor(now / 1000),
    sub: person.name,
    pv: await passcodeVersion(AUTH_SECRET, person),
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSign(AUTH_SECRET, "session", encoded);
  return `${encoded}.${toBase64Url(signature)}`;
}

/**
 * The session for a token this app signed less than SESSION_MAX_AGE_DAYS ago,
 * for someone still in APP_PASSCODES with the same code; otherwise null. The
 * signature is checked before anything is parsed.
 */
export async function verifySessionToken(
  token: string,
  now = Date.now(),
): Promise<Session | null> {
  const { APP_PASSCODES, AUTH_SECRET } = authEnv();

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;
  if (!(await hmacVerify(AUTH_SECRET, "session", encoded, signatureBytes))) {
    return null;
  }

  const payload = parsePayload(encoded);
  if (!payload) return null;
  const age = Math.floor(now / 1000) - payload.iat;
  if (age < -CLOCK_SKEW_SECONDS || age >= MAX_AGE_SECONDS) return null;

  const person = APP_PASSCODES.find((candidate) => candidate.name === payload.sub);
  if (!person) return null;
  if (payload.pv !== (await passcodeVersion(AUTH_SECRET, person))) return null;
  return { person: person.name };
}

// Validated together so a missing-key error names both.
function authEnv() {
  return envPick("APP_PASSCODES", "AUTH_SECRET");
}

// Changes whenever that person's code does, so a new code signs out only
// their devices. Keyed rather than a plain hash, so someone holding a cookie
// can't test code guesses offline. Names can't hold a colon, so the MAC'd
// text is unambiguous.
async function passcodeVersion(secret: string, person: Person) {
  const mac = await hmacSign(secret, "passcode-version", `${person.name}:${person.code}`);
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

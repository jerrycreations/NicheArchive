import "server-only";
import { hmacSign, hmacVerify } from "@/lib/auth/crypto";
import { envPick } from "@/lib/env";

/**
 * The name of the person whose code `input` is, or null. The input's MAC is
 * checked against every code, without stopping at a match, and Web Crypto
 * compares in constant time, so the time taken doesn't say which code, if
 * any, it was close to.
 */
export async function verifyPasscode(input: string): Promise<string | null> {
  const { APP_PASSCODES, AUTH_SECRET } = envPick("APP_PASSCODES", "AUTH_SECRET");
  // The env schema trims each code, so trim what was typed the same way.
  const typed = await hmacSign(AUTH_SECRET, "passcode", input.trim());
  let match: string | null = null;
  for (const person of APP_PASSCODES) {
    if (await hmacVerify(AUTH_SECRET, "passcode", person.code, typed)) match = person.name;
  }
  return match;
}

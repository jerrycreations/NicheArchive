import "server-only";
import { hmacSign, hmacVerify } from "@/lib/auth/crypto";
import { envPick } from "@/lib/env";

/**
 * Whether `input` is the shared passcode. Both sides go through HMAC before
 * Web Crypto compares them, so the check takes the same time whatever the
 * input's length or content.
 */
export async function verifyPasscode(input: string): Promise<boolean> {
  const { APP_PASSCODE, AUTH_SECRET } = envPick("APP_PASSCODE", "AUTH_SECRET");
  const expected = await hmacSign(AUTH_SECRET, "passcode", APP_PASSCODE);
  // The env schema trims APP_PASSCODE, so trim what was typed the same way.
  return hmacVerify(AUTH_SECRET, "passcode", input.trim(), expected);
}

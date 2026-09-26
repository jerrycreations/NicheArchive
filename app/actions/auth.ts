"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unlockClientKey } from "@/lib/auth/client-key";
import { safeNextPath, UNLOCK_PATH } from "@/lib/auth/next-path";
import { verifyPasscode } from "@/lib/auth/passcode";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { UNLOCK_LOCKOUT_MINUTES } from "@/lib/constants";
import {
  clearUnlockAttempts,
  reserveUnlockAttempt,
  type UnlockAttempt,
} from "@/lib/db/queries/unlock-attempts";
import { DATABASE_UNREACHABLE, isDatabaseUnreachable } from "@/lib/errors";

export type UnlockState = { error: string | null };

/** Slows down guessing on top of the attempt limit. */
const FAILED_UNLOCK_DELAY_MS = 500;

/**
 * Signs in whoever's code was typed. Each IP address gets
 * UNLOCK_MAX_ATTEMPTS tries; a wrong last one locks it out for
 * UNLOCK_LOCKOUT_MINUTES.
 */
export async function unlock(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const passcode = formData.get("passcode");
  // The field is required, so this is a hand-made request; it costs no try.
  if (typeof passcode !== "string" || !passcode.trim()) {
    return { error: "Enter your code." };
  }

  let clientKey: string;
  let attempt: UnlockAttempt;
  try {
    clientKey = await unlockClientKey();
    attempt = await reserveUnlockAttempt(clientKey);
  } catch (error) {
    // Without the count, nobody gets in.
    console.error("unlock failed:", error);
    return {
      error: isDatabaseUnreachable(error)
        ? DATABASE_UNREACHABLE
        : "Couldn't check your code. Try again.",
    };
  }
  if (!attempt.allowed) return { error: lockedOutMessage(attempt.retryAt) };

  const person = await verifyPasscode(passcode);
  if (!person) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_UNLOCK_DELAY_MS));
    return { error: wrongCodeMessage(attempt.triesLeft) };
  }

  try {
    await clearUnlockAttempts(clientKey);
  } catch (error) {
    // The earlier wrong tries still count for an hour; not worth refusing over.
    console.error("Clearing unlock attempts failed:", error);
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(person), sessionCookieOptions());
  redirect(safeNextPath(formData.get("next")));
}

/** Signs this device out and goes to the unlock page. */
export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect(UNLOCK_PATH);
}

function wrongCodeMessage(triesLeft: number): string {
  if (triesLeft === 0) {
    return `That code isn't right, and that was the last try. Try again in ${waitText(UNLOCK_LOCKOUT_MINUTES)}.`;
  }
  return `That code isn't right. ${triesLeft} ${triesLeft === 1 ? "try" : "tries"} left.`;
}

function lockedOutMessage(retryAt: Date): string {
  const minutes = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 60_000));
  return `Too many wrong codes. Try again in ${waitText(minutes)}.`;
}

function waitText(minutes: number): string {
  if (minutes === 60) return "an hour";
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { verifyPasscode } from "@/lib/auth/passcode";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export type UnlockState = { error: string | null };

/** Slows down guessing. There's no lockout, so a long passcode matters more. */
const FAILED_UNLOCK_DELAY_MS = 500;

export async function unlock(
  _previous: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const passcode = formData.get("passcode");
  if (typeof passcode !== "string" || !(await verifyPasscode(passcode))) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_UNLOCK_DELAY_MS));
    return { error: "That passcode isn't right." };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    await createSessionToken(),
    sessionCookieOptions(),
  );
  redirect(safeNextPath(formData.get("next")));
}

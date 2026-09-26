import "server-only";
import { eq, sql } from "drizzle-orm";
import { UNLOCK_LOCKOUT_MINUTES, UNLOCK_MAX_ATTEMPTS } from "@/lib/constants";
import { db } from "@/lib/db";
import { unlockAttempts } from "@/lib/db/schema";

const LOCKOUT = sql.raw(`interval '${UNLOCK_LOCKOUT_MINUTES} minutes'`);

/** Whether an IP address may try a code now. */
export type UnlockAttempt =
  | {
      allowed: true;
      /** Tries left after this one if it's wrong; 0 means a wrong one locks the address out. */
      triesLeft: number;
    }
  | { allowed: false; retryAt: Date };

/**
 * Counts a try for `clientKey` before its code is checked, in one statement,
 * so tries sent in parallel can't get past the limit. Tries count for an
 * hour from the first. The last allowed try restarts that hour, so a wrong
 * last try locks the address out for a full hour from then.
 */
export async function reserveUnlockAttempt(clientKey: string): Promise<UnlockAttempt> {
  // In ON CONFLICT DO UPDATE, the table's columns are the stored row's values.
  const expired = sql`${unlockAttempts.windowStartedAt} <= now() - ${LOCKOUT}`;
  const [row] = await db()
    .insert(unlockAttempts)
    .values({ clientKey, attempts: 1, windowStartedAt: sql`now()` })
    .onConflictDoUpdate({
      target: unlockAttempts.clientKey,
      set: {
        attempts: sql`case when ${expired} then 1 else ${unlockAttempts.attempts} + 1 end`,
        windowStartedAt: sql`case when ${expired} or ${unlockAttempts.attempts} + 1 = ${UNLOCK_MAX_ATTEMPTS}::int then now() else ${unlockAttempts.windowStartedAt} end`,
      },
    })
    .returning({
      attempts: unlockAttempts.attempts,
      windowStartedAt: unlockAttempts.windowStartedAt,
    });

  if (row.attempts <= UNLOCK_MAX_ATTEMPTS) {
    return { allowed: true, triesLeft: UNLOCK_MAX_ATTEMPTS - row.attempts };
  }
  return {
    allowed: false,
    retryAt: new Date(row.windowStartedAt.getTime() + UNLOCK_LOCKOUT_MINUTES * 60_000),
  };
}

/** Forgets an address's tries, after it gets a code right. */
export async function clearUnlockAttempts(clientKey: string): Promise<void> {
  await db().delete(unlockAttempts).where(eq(unlockAttempts.clientKey, clientKey));
}

/** Deletes rows whose tries stopped counting over a day ago. The daily cron runs it. */
export async function deleteStaleUnlockAttempts(): Promise<void> {
  await db()
    .delete(unlockAttempts)
    .where(sql`${unlockAttempts.windowStartedAt} < now() - interval '1 day'`);
}

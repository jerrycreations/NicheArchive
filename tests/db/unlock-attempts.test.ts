import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UNLOCK_LOCKOUT_MINUTES, UNLOCK_MAX_ATTEMPTS } from "@/lib/constants";
import {
  clearUnlockAttempts,
  deleteStaleUnlockAttempts,
  reserveUnlockAttempt,
} from "@/lib/db/queries/unlock-attempts";
import { unlockAttempts } from "@/lib/db/schema";
import { createTestDb, type TestDb } from "./setup";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/db", () => ({ db: () => testDb.current }));

let test: TestDb;

const KEY = "client-a";
const HOUR_MS = UNLOCK_LOCKOUT_MINUTES * 60_000;

beforeAll(async () => {
  test = await createTestDb();
  testDb.current = test.db;
});

afterAll(async () => {
  await test.client.close();
});

beforeEach(async () => {
  await test.raw.delete(unlockAttempts);
});

async function tries(count: number, key = KEY) {
  const results = [];
  for (let i = 0; i < count; i++) results.push(await reserveUnlockAttempt(key));
  return results;
}

/** Moves a key's window back in time, as if its first try was `minutes` ago. */
async function startedMinutesAgo(minutes: number, key = KEY) {
  await test.raw
    .update(unlockAttempts)
    .set({ windowStartedAt: sql`now() - make_interval(mins => ${minutes})` })
    .where(eq(unlockAttempts.clientKey, key));
}

describe("reserveUnlockAttempt", () => {
  it(`allows ${UNLOCK_MAX_ATTEMPTS} tries, counting down, then refuses`, async () => {
    const results = await tries(UNLOCK_MAX_ATTEMPTS + 2);
    expect(results.slice(0, UNLOCK_MAX_ATTEMPTS)).toEqual([
      { allowed: true, triesLeft: 4 },
      { allowed: true, triesLeft: 3 },
      { allowed: true, triesLeft: 2 },
      { allowed: true, triesLeft: 1 },
      { allowed: true, triesLeft: 0 },
    ]);
    for (const refused of results.slice(UNLOCK_MAX_ATTEMPTS)) {
      expect(refused.allowed).toBe(false);
    }
  });

  it("locks an address out for an hour from its last allowed try", async () => {
    await tries(UNLOCK_MAX_ATTEMPTS - 1);
    // The first tries were long ago, but still inside the hour.
    await startedMinutesAgo(50);
    const before = Date.now();
    await tries(1);
    const [refused] = await tries(1);

    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    const lockedFor = refused.retryAt.getTime() - before;
    expect(lockedFor).toBeGreaterThan(HOUR_MS - 5_000);
    expect(lockedFor).toBeLessThanOrEqual(HOUR_MS + 5_000);
  });

  it("keeps the lock where it is while refused tries keep coming", async () => {
    await tries(UNLOCK_MAX_ATTEMPTS);
    const [first] = await tries(1);
    const [later] = await tries(1);
    expect(first.allowed || later.allowed).toBe(false);
    if (first.allowed || later.allowed) return;
    expect(later.retryAt).toEqual(first.retryAt);
  });

  it("starts counting again once the hour has passed", async () => {
    await tries(UNLOCK_MAX_ATTEMPTS + 1);
    await startedMinutesAgo(UNLOCK_LOCKOUT_MINUTES + 1);
    expect(await tries(1)).toEqual([{ allowed: true, triesLeft: 4 }]);
  });

  it("counts each address on its own", async () => {
    await tries(UNLOCK_MAX_ATTEMPTS + 1, "client-a");
    expect(await tries(1, "client-b")).toEqual([{ allowed: true, triesLeft: 4 }]);
  });

  it("never lets more than the limit through when tries arrive together", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveUnlockAttempt(KEY)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(UNLOCK_MAX_ATTEMPTS);
  });
});

describe("clearUnlockAttempts", () => {
  it("forgets an address's tries after a right code", async () => {
    await tries(3);
    await clearUnlockAttempts(KEY);
    expect(await tries(1)).toEqual([{ allowed: true, triesLeft: 4 }]);
  });
});

describe("deleteStaleUnlockAttempts", () => {
  it("deletes rows over a day old and keeps the rest", async () => {
    await tries(1, "old");
    await tries(1, "recent");
    await startedMinutesAgo(25 * 60, "old");

    await deleteStaleUnlockAttempts();

    const keys = await test.raw.select({ key: unlockAttempts.clientKey }).from(unlockAttempts);
    expect(keys).toEqual([{ key: "recent" }]);
  });
});

// Daily keep-alive (vercel.json), so Supabase's free tier doesn't pause the
// database after a week without activity. It also clears out old unlock tries.
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deleteStaleUnlockAttempts } from "@/lib/db/queries/unlock-attempts";
import { envPick } from "@/lib/env";
import { serverErrorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel sends this header on cron runs when CRON_SECRET is set.
  const expected = `Bearer ${envPick("CRON_SECRET").CRON_SECRET}`;
  if (!safeEqual(request.headers.get("authorization") ?? "", expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db().execute(sql`select 1`);
    await deleteStaleUnlockAttempts();
  } catch (error) {
    // Still a failure, so the cron run shows as failed in Vercel.
    return serverErrorResponse("GET /api/cron/ping", error);
  }
  return Response.json({ ok: true, at: new Date().toISOString() });
}

// Compares digests so the check takes the same time whatever the input.
function safeEqual(a: string, b: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

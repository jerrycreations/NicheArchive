import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { envPick } from "@/lib/env";
import * as schema from "@/lib/db/schema";

function createDb() {
  const client = postgres(envPick("DATABASE_URL").DATABASE_URL, {
    // Supabase's transaction pooler doesn't support prepared statements.
    prepare: false,
    // One connection per serverless instance; the pooler does the pooling.
    max: 1,
    // Encrypt traffic to Supabase. `require` doesn't verify the certificate.
    ssl: "require",
  });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

// Kept on globalThis so dev hot reloads reuse one client instead of leaking
// a new connection on every edit.
const globalForDb = globalThis as typeof globalThis & { __nicheArchiveDb?: Db };

/**
 * The Drizzle client, created on first use rather than at import, so
 * `next build` runs without a database URL.
 */
export function db(): Db {
  globalForDb.__nicheArchiveDb ??= createDb();
  return globalForDb.__nicheArchiveDb;
}

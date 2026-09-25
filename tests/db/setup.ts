// A real Postgres for tests: PGlite (Postgres compiled to WebAssembly) with
// pgvector, and every migration in drizzle/ applied, as on Supabase. Each
// test file points `@/lib/db` at its own instance:
//
//   const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
//   vi.mock("@/lib/db", () => ({ db: () => testDb.current }));
//   beforeAll(async () => { testDb.current = (await createTestDb()).db; });
//
// so the app's query modules run unchanged against it.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { EMBEDDING_VECTOR_DIMENSIONS } from "@/lib/constants";
import * as schema from "@/lib/db/schema";
import { videos } from "@/lib/db/schema";
import type { NewVideo } from "@/lib/db/types";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const client = new PGlite({ extensions: { vector } });
  // Supabase keeps extensions in their own schema, on every role's search
  // path, and the migrations use `vector` unqualified.
  await client.exec(`set search_path to "$user", public, extensions`);
  const raw = drizzle({ client, schema });
  await migrate(raw, { migrationsFolder: MIGRATIONS });
  return { db: likePostgresJs(raw), raw, client };
}

/**
 * The PGlite database, except that `execute` resolves to the rows, as the
 * app's postgres.js driver does, rather than to a result object.
 */
function likePostgresJs<T extends object>(database: T): T {
  const execute = (database as unknown as { execute(query: unknown): Promise<{ rows: unknown }> })
    .execute.bind(database);
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "execute") return Reflect.get(target, property, receiver);
      return async (query: unknown) => (await execute(query)).rows;
    },
  });
}

let videoCount = 0;

/**
 * Saves a video with made-up metadata, overridable. Each call gets a new
 * YouTube ID, and `createdAt` a second later than the last, so orders by date
 * added are predictable.
 */
export async function insertTestVideo(
  database: TestDb["raw"],
  values: Partial<NewVideo> = {},
): Promise<{ id: string; youtubeId: string }> {
  videoCount += 1;
  const [row] = await database
    .insert(videos)
    .values({
      youtubeId: `test${String(videoCount).padStart(7, "0")}`,
      title: `Test video ${videoCount}`,
      channel: "Test channel",
      durationSeconds: 60,
      publishedAt: new Date(Date.UTC(2025, 0, videoCount)),
      privacyStatus: "public",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, videoCount)),
      ...values,
    })
    .returning({ id: videos.id, youtubeId: videos.youtubeId });
  return row;
}

/**
 * A unit vector of the embedding column's size: `weights` maps axes to their
 * weights before scaling, so `embedding({ 1: 1, 3: 0.5 })` points mostly
 * along axis 1 and a little along axis 3.
 */
export function embedding(weights: Record<number, number>): number[] {
  const values = new Array<number>(EMBEDDING_VECTOR_DIMENSIONS).fill(0);
  for (const [axis, weight] of Object.entries(weights)) values[Number(axis)] = weight;
  const length = Math.hypot(...values);
  return values.map((value) => value / length);
}

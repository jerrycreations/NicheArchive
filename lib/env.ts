import "server-only";
import { z } from "zod";
import { EMBEDDING_VECTOR_DIMENSIONS } from "@/lib/constants";

// Blank `KEY=` lines in .env files arrive as "", so they count as missing too.
const text = () =>
  z.string({ error: "is missing" }).trim().min(1, "is missing");

const envSchema = z.object({
  // Supabase transaction pooler (port 6543). DATABASE_MIGRATION_URL is read
  // only by drizzle-kit, so it isn't part of the runtime schema.
  DATABASE_URL: text().regex(
    /^postgres(ql)?:\/\//,
    "must be a postgres:// connection string",
  ),
  YOUTUBE_API_KEY: text(),
  GOOGLE_GENERATIVE_AI_API_KEY: text(),
  GEMINI_CHAT_MODEL: text(),
  GEMINI_REWRITE_MODEL: text(),
  GEMINI_EMBEDDING_MODEL: text(),
  EMBEDDING_DIMENSIONS: text()
    .transform(Number)
    .pipe(
      z.literal(EMBEDDING_VECTOR_DIMENSIONS, {
        error: `must be ${EMBEDDING_VECTOR_DIMENSIONS}, the size of the vector column`,
      }),
    ),
  CRON_SECRET: text(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Server environment variables, validated on first use rather than at import,
 * so `next build` and CI run without secrets. Throws one error naming every
 * missing or invalid key.
 */
export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(envSchema);
  return cached;
}

/**
 * Only the named keys, validated the same way as env(). For code that has to
 * work before everything else is set: the database client and the keep-alive
 * cron, which must stop Supabase pausing even while the Google keys are blank.
 */
export function envPick<K extends keyof Env>(...keys: K[]): Pick<Env, K> {
  // Typed as a mask over every key so pick() accepts a generic key list; the
  // return type narrows the result back to the picked keys.
  const mask = Object.fromEntries(keys.map((key) => [key, true])) as {
    [P in keyof Env]?: true;
  };
  return parseEnv(envSchema.pick(mask));
}

function parseEnv<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;

  // Keep the first problem per key; a blank DATABASE_URL is "missing", not also "not a postgres:// string".
  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    if (!problems.has(key)) problems.set(key, issue.message);
  }
  const lines = [...problems].map(([key, message]) => `  - ${key} ${message}`);
  throw new Error(
    `Invalid environment variables:\n${lines.join("\n")}\n` +
      "Set them in .env.local (see .env.example) or in the Vercel project settings.",
  );
}

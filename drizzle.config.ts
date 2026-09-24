import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load .env.local ourselves.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Supabase's session pooler (port 5432): DDL-safe and reachable over IPv4.
    // Only `db:migrate` and `db:studio` connect; `db:generate` works without it.
    url: process.env.DATABASE_MIGRATION_URL ?? "",
  },
});

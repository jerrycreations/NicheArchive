import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres full-text search document. Drizzle has no built-in type for it.
 * These columns are always generated, so the app never writes them.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

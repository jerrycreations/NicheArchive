/**
 * Text for a LIKE or ILIKE pattern, matched literally: `%` and `_` stop being
 * wildcards. Backslash is Postgres's default escape character, so it's
 * escaped first.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

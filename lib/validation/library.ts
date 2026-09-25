import { z } from "zod";
import { VIDEO_SORTS } from "@/lib/validation/video";

/** Longer search text is cut to this, which is still far more than a search needs. */
export const MAX_LIBRARY_QUERY_CHARS = 200;

/** A URL parameter's first value, since `?q=a&q=b` arrives as an array. */
const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/**
 * The library page's `?q=` (search text) and `?sort=` (`added` or
 * `published`). Anything unreadable falls back to no search, newest added first.
 */
export const librarySearchParamsSchema = z.object({
  q: z.preprocess(
    firstValue,
    z
      .string()
      .transform((text) => text.trim().slice(0, MAX_LIBRARY_QUERY_CHARS).trim())
      .catch(""),
  ),
  sort: z.preprocess(firstValue, z.enum(VIDEO_SORTS).catch("added")),
});

export type LibrarySearchParams = z.output<typeof librarySearchParamsSchema>;

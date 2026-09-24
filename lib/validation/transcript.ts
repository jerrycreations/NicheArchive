import { z } from "zod";
import { MAX_PASTED_TRANSCRIPT_CHARS } from "@/lib/constants";
import { youtubeIdSchema } from "@/lib/validation/video";

/** savePastedTranscript's input. The text itself is checked by parsePastedTranscript. */
export const pasteTranscriptInputSchema = z.object({
  youtubeId: youtubeIdSchema,
  text: z.string().max(MAX_PASTED_TRANSCRIPT_CHARS),
});

export type PasteTranscriptInput = z.input<typeof pasteTranscriptInputSchema>;

/** The body of POST /api/transcripts/process. */
export const processRequestSchema = z.object({ youtubeId: youtubeIdSchema });

/** Most videos GET /api/videos/status reports on at once. */
export const MAX_STATUS_IDS = 100;

/** GET /api/videos/status's `ids`: comma-separated YouTube IDs, repeats ignored. */
export const statusIdsSchema = z
  .string()
  .transform((ids) => [...new Set(ids.split(",").map((id) => id.trim()).filter(Boolean))])
  .pipe(z.array(youtubeIdSchema).min(1).max(MAX_STATUS_IDS));

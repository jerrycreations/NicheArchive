import { z } from "zod";
import { isVideoId } from "@/lib/youtube/url";

/** Library orders, both newest first: by when it was added, or by publish date. */
export const VIDEO_SORTS = ["added", "published"] as const;

export type VideoSort = (typeof VIDEO_SORTS)[number];

export const youtubeIdSchema = z
  .string()
  .refine(isVideoId, "must be an 11-character YouTube video ID");

/**
 * addVideo's input. The URL itself is checked with parseYouTubeUrl() after
 * this, so the user hears why a link was rejected.
 */
export const addVideoInputSchema = z.object({
  url: z.string().max(2048),
  /** Set once the user has agreed to add a video over 30 minutes long. */
  confirmLong: z.boolean().default(false),
});

export type AddVideoInput = z.input<typeof addVideoInputSchema>;

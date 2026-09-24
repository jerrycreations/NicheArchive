/** One timed piece of a transcript. Times are in seconds. */
export type TranscriptSegment = {
  start: number;
  duration: number;
  text: string;
};

/** Where a transcript came from, in the order the pipeline tries them (pasting is the manual fallback). */
export const TRANSCRIPT_SOURCES = [
  "manual_captions",
  "auto_captions",
  "gemini",
  "pasted",
] as const;

export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export const TRANSCRIPT_STATUSES = ["pending", "ready", "failed"] as const;

export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

import type { VideoRow } from "@/lib/db/types";
import { segmentsToParagraphs } from "@/lib/transcript/text";
import type { TranscriptSegment } from "@/lib/transcript/types";
import { buildWatchUrl } from "@/lib/youtube/url";

/** What an exported file needs of a video. */
export type ExportVideo = Pick<VideoRow, "youtubeId" | "title" | "channel" | "publishedAt"> & {
  transcriptSegments: TranscriptSegment[];
};

/**
 * One video's transcript as a .txt file, in the spec's export format: a short
 * header, a blank line, then the transcript as plain paragraphs separated by
 * blank lines, with no timestamps. Ends with a newline.
 *
 * ```text
 * Title: How Bread Rises
 * Channel: The Kitchen Lab
 * URL: https://www.youtube.com/watch?v=abc123xyz00
 * Published: 2025-03-14
 *
 * First paragraph of the transcript...
 * ```
 */
export function formatTranscriptFile(video: ExportVideo): string {
  const header = [
    `Title: ${oneLine(video.title)}`,
    `Channel: ${oneLine(video.channel)}`,
    `URL: ${buildWatchUrl(video.youtubeId)}`,
    `Published: ${utcDate(video.publishedAt)}`,
  ];
  const paragraphs = segmentsToParagraphs(video.transcriptSegments);
  return [header.join("\n"), ...paragraphs].join("\n\n") + "\n";
}

/** A header value on one line, since a line break would start a new field. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** `YYYY-MM-DD` in UTC, so the date doesn't depend on the server's time zone. */
function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

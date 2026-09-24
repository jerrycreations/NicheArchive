import "server-only";
import { z } from "zod";
import { envPick } from "@/lib/env";
import { parseIso8601Duration } from "@/lib/time";
import { classifyApiError, describeApiError, type YouTubeErrorKind } from "./errors";

const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

// Only what the app stores, so the response stays small.
const FIELDS =
  "items(snippet(title,channelTitle,publishedAt,liveBroadcastContent),contentDetails(duration),status(privacyStatus))";

const TIMEOUT_MS = 10_000;

const itemSchema = z.object({
  snippet: z.object({
    title: z.string(),
    channelTitle: z.string(),
    publishedAt: z.string(),
    liveBroadcastContent: z.string(),
  }),
  contentDetails: z.object({ duration: z.string() }),
  status: z.object({ privacyStatus: z.string() }),
});

// With the fields filter, a lookup that finds nothing may leave `items` out.
const responseSchema = z.object({ items: z.array(itemSchema).default([]) });

/** What the app stores about a video, from YouTube Data API v3. */
export type VideoMetadata = {
  youtubeId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  publishedAt: Date;
  /** public, unlisted or private. Gemini can only transcribe public videos. */
  privacyStatus: string;
  /** none, live or upcoming. Only finished videos ("none") come back ok. */
  liveBroadcastContent: string;
};

export type MetadataResult =
  | { ok: true; video: VideoMetadata }
  | { ok: false; error: YouTubeErrorKind; detail: string };

/**
 * Looks a video up with videos.list, which costs 1 of the 10,000 daily quota
 * units. Never throws: failures come back with a kind for the user and a
 * detail for the server logs.
 */
export async function fetchVideoMetadata(youtubeId: string): Promise<MetadataResult> {
  let apiKey: string;
  try {
    apiKey = envPick("YOUTUBE_API_KEY").YOUTUBE_API_KEY;
  } catch (error) {
    return failure("bad_key", errorText(error));
  }

  const query = new URLSearchParams({
    part: "snippet,contentDetails,status",
    id: youtubeId,
    fields: FIELDS,
  });

  let response: Response;
  try {
    response = await fetch(`${VIDEOS_ENDPOINT}?${query}`, {
      // A header rather than ?key=, so the key never shows up in logged URLs.
      headers: { "X-Goog-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return failure(
      "network",
      isTimeout(error)
        ? `YouTube didn't respond within ${TIMEOUT_MS / 1000} seconds.`
        : errorText(error),
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return failure(
      classifyApiError(response.status, body),
      describeApiError(response.status, body),
    );
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return failure("unexpected", `Unexpected response shape: ${parsed.error.message}`);
  }

  // Private and deleted videos both come back as an empty list.
  const [item] = parsed.data.items;
  if (!item) return failure("not_found", "videos.list returned no items.");

  const { snippet, contentDetails, status } = item;
  if (snippet.liveBroadcastContent === "live" || snippet.liveBroadcastContent === "upcoming") {
    return failure("live_or_upcoming", `liveBroadcastContent is ${snippet.liveBroadcastContent}.`);
  }

  const durationSeconds = parseIso8601Duration(contentDetails.duration);
  const publishedAt = new Date(snippet.publishedAt);
  if (durationSeconds === null || Number.isNaN(publishedAt.getTime())) {
    return failure(
      "unexpected",
      `Unreadable duration "${contentDetails.duration}" or publish date "${snippet.publishedAt}".`,
    );
  }

  return {
    ok: true,
    video: {
      youtubeId,
      title: snippet.title,
      channel: snippet.channelTitle,
      durationSeconds,
      publishedAt,
      privacyStatus: status.privacyStatus,
      liveBroadcastContent: snippet.liveBroadcastContent,
    },
  };
}

function failure(error: YouTubeErrorKind, detail: string): MetadataResult {
  return { ok: false, error, detail };
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

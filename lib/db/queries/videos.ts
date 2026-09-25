import "server-only";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { chats, videos } from "@/lib/db/schema";
import type {
  NewVideo,
  VideoDetail,
  VideoListItem,
  VideoOption,
  VideoRow,
} from "@/lib/db/types";
import {
  effectiveStatus,
  staleCutoff,
  type TranscriptStatusInfo,
} from "@/lib/transcript/status";
import type { TranscriptSegment, TranscriptSource } from "@/lib/transcript/types";
import type { VideoSort } from "@/lib/validation/video";

// Every column except the generated search_vector, which nothing reads back.
const VIDEO_COLUMNS = { searchVector: false } as const;

export async function getVideoByYoutubeId(youtubeId: string): Promise<VideoRow | null> {
  const video = await db().query.videos.findFirst({
    columns: VIDEO_COLUMNS,
    where: eq(videos.youtubeId, youtubeId),
  });
  return video ?? null;
}

export async function getVideoById(id: string): Promise<VideoRow | null> {
  const video = await db().query.videos.findFirst({
    columns: VIDEO_COLUMNS,
    where: eq(videos.id, id),
  });
  return video ?? null;
}

/**
 * A video for its own page, with its effective transcript status (stalled
 * processing reads as failed) and how many chats are about it.
 */
export async function getVideoDetail(youtubeId: string): Promise<VideoDetail | null> {
  const video = await getVideoByYoutubeId(youtubeId);
  if (!video) return null;
  const chatCount = await countChatsForVideo(video.id);
  return { ...video, ...effectiveStatus(video, new Date()), chatCount };
}

/**
 * The library grid, newest first by date added or by publish date. Statuses
 * are as people should see them: processing that stalled reads as failed.
 */
export async function listVideos({
  sort = "added",
}: { sort?: VideoSort } = {}): Promise<VideoListItem[]> {
  const database = db();
  const rows = await database
    .select({
      id: videos.id,
      youtubeId: videos.youtubeId,
      title: videos.title,
      channel: videos.channel,
      durationSeconds: videos.durationSeconds,
      publishedAt: videos.publishedAt,
      createdAt: videos.createdAt,
      status: videos.status,
      processingStartedAt: videos.processingStartedAt,
      // A correlated count(*), so the whole grid is one query.
      chatCount: database.$count(chats, eq(chats.videoId, videos.id)),
    })
    .from(videos)
    .orderBy(
      ...(sort === "published"
        ? [desc(videos.publishedAt), desc(videos.createdAt)]
        : [desc(videos.createdAt)]),
    );

  const now = new Date();
  return rows.map((row) => ({ ...row, status: effectiveStatus(row, now).status }));
}

/** Every video for the new-chat picker, newest first, with its effective status. */
export async function listVideoOptions(): Promise<VideoOption[]> {
  const rows = await db()
    .select({
      id: videos.id,
      youtubeId: videos.youtubeId,
      title: videos.title,
      channel: videos.channel,
      status: videos.status,
      processingStartedAt: videos.processingStartedAt,
    })
    .from(videos)
    .orderBy(desc(videos.createdAt));

  const now = new Date();
  return rows.map(({ processingStartedAt, ...row }) => ({
    ...row,
    status: effectiveStatus({ status: row.status, processingStartedAt }, now).status,
  }));
}

/** Transcript states for the status route. Videos that don't exist are left out. */
export async function listVideoStatuses(youtubeIds: string[]): Promise<TranscriptStatusInfo[]> {
  if (youtubeIds.length === 0) return [];
  const rows = await db()
    .select({
      youtubeId: videos.youtubeId,
      status: videos.status,
      source: videos.transcriptSource,
      errorMessage: videos.errorMessage,
      processingStartedAt: videos.processingStartedAt,
    })
    .from(videos)
    .where(inArray(videos.youtubeId, youtubeIds));

  const now = new Date();
  return rows.map((row) => ({
    youtubeId: row.youtubeId,
    source: row.source,
    ...effectiveStatus(row, now),
  }));
}

/**
 * Claims a video for transcript processing, so only one run works on it at a
 * time. Works on a pending or failed video that nobody is processing, or
 * whose claim has stalled. Returns the claim time, which the run hands back
 * to its writes, or null when the video is ready, already claimed or gone.
 *
 * `now` comes from JavaScript rather than the database's now(): Postgres
 * keeps microseconds and a JS Date doesn't, so a database timestamp wouldn't
 * compare equal once it came back.
 */
export async function claimForProcessing(videoId: string, now: Date): Promise<Date | null> {
  const [row] = await db()
    .update(videos)
    .set({ processingStartedAt: now, status: "pending", errorMessage: null })
    .where(
      and(
        eq(videos.id, videoId),
        inArray(videos.status, ["pending", "failed"]),
        or(isNull(videos.processingStartedAt), lt(videos.processingStartedAt, staleCutoff(now))),
      ),
    )
    .returning({ claimedAt: videos.processingStartedAt });
  return row?.claimedAt ?? null;
}

export type TranscriptValues = {
  segments: TranscriptSegment[];
  /** Plain text of the segments, from segmentsToPlainText. */
  text: string;
  source: TranscriptSource;
  timestampsEstimated: boolean;
};

/**
 * Saves a transcript, marks the video ready and clears any claim. A pipeline
 * run passes its claim time, and then the write only lands if nothing has
 * taken the video over since: a paste, or a retry after the run stalled. A
 * paste passes none, so it always lands, and a run still going for the video
 * can't overwrite it. Returns whether the video was updated.
 */
export async function writeTranscript(
  videoId: string,
  values: TranscriptValues,
  { claimedAt }: { claimedAt?: Date } = {},
): Promise<boolean> {
  const updated = await db()
    .update(videos)
    .set({
      transcriptSegments: values.segments,
      transcriptText: values.text,
      transcriptSource: values.source,
      timestampsEstimated: values.timestampsEstimated,
      status: "ready",
      errorMessage: null,
      processingStartedAt: null,
    })
    .where(
      claimedAt
        ? and(eq(videos.id, videoId), eq(videos.processingStartedAt, claimedAt))
        : eq(videos.id, videoId),
    )
    .returning({ id: videos.id });
  return updated.length > 0;
}

/**
 * Marks a claimed video failed, with why each source failed, and clears the
 * claim so a retry can start at once. Like writeTranscript, it only lands
 * while the claim is still this run's. Returns whether the video was updated.
 */
export async function markTranscriptFailed(
  videoId: string,
  claimedAt: Date,
  message: string,
): Promise<boolean> {
  const updated = await db()
    .update(videos)
    .set({ status: "failed", errorMessage: message, processingStartedAt: null })
    .where(and(eq(videos.id, videoId), eq(videos.processingStartedAt, claimedAt)))
    .returning({ id: videos.id });
  return updated.length > 0;
}

/**
 * Saves a new video. Returns null when its YouTube ID is already saved, so
 * two adds of the same video racing each other can't both succeed.
 */
export async function insertVideo(values: NewVideo): Promise<{ id: string } | null> {
  const [row] = await db()
    .insert(videos)
    .values(values)
    .onConflictDoNothing({ target: videos.youtubeId })
    .returning({ id: videos.id });
  return row ?? null;
}

/** How many chats are about this video. Deleting the video deletes them too. */
export async function countChatsForVideo(videoId: string): Promise<number> {
  return db().$count(chats, eq(chats.videoId, videoId));
}

/**
 * Deletes a video. Its transcript lives on the row, and the foreign keys
 * cascade to its search chunks, its chats and their messages. Returns false
 * if it was already gone.
 */
export async function deleteVideoByYoutubeId(youtubeId: string): Promise<boolean> {
  const deleted = await db()
    .delete(videos)
    .where(eq(videos.youtubeId, youtubeId))
    .returning({ id: videos.id });
  return deleted.length > 0;
}

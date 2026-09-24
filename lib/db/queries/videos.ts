import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chats, videos } from "@/lib/db/schema";
import type { NewVideo, VideoListItem, VideoRow } from "@/lib/db/types";
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

/** The library grid, newest first by date added or by publish date. */
export async function listVideos({
  sort = "added",
}: { sort?: VideoSort } = {}): Promise<VideoListItem[]> {
  const database = db();
  return database
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

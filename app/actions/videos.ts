"use server";

import { revalidatePath } from "next/cache";
import { actionError, unexpectedError, type ActionError } from "@/lib/actions/result";
import { getSession } from "@/lib/auth/require-session";
import { LONG_VIDEO_WARNING_SECONDS } from "@/lib/constants";
import {
  deleteVideoByYoutubeId,
  getVideoByYoutubeId,
  insertVideo,
} from "@/lib/db/queries/videos";
import { SIGNED_OUT } from "@/lib/errors";
import {
  addVideoInputSchema,
  youtubeIdSchema,
  type AddVideoInput,
} from "@/lib/validation/video";
import { youTubeErrorMessage } from "@/lib/youtube/errors";
import { fetchVideoMetadata } from "@/lib/youtube/metadata";
import { parseYouTubeUrl, type YouTubeUrlFailure } from "@/lib/youtube/url";

export type AddVideoResult =
  | { kind: "added"; youtubeId: string; title: string }
  | { kind: "already_exists"; youtubeId: string; title: string }
  | { kind: "needs_confirmation"; title: string; durationSeconds: number }
  | { kind: "invalid_url"; reason: YouTubeUrlFailure }
  | { kind: "not_found" | "live_or_upcoming" | "quota_exceeded" }
  | ActionError;

export type DeleteVideoResult = { kind: "deleted" } | ActionError;

/**
 * Saves a YouTube video by URL with its transcript status `pending`. It
 * doesn't fetch the transcript; the client starts that after `added`.
 */
export async function addVideo(input: AddVideoInput): Promise<AddVideoResult> {
  if (!(await getSession())) return actionError(SIGNED_OUT);
  const parsed = addVideoInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid_url", reason: "not_youtube" };
  const url = parseYouTubeUrl(parsed.data.url);
  if (!url.ok) return { kind: "invalid_url", reason: url.reason };

  const result = await saveVideo(url.id, parsed.data.confirmLong).catch(
    (error: unknown) => unexpectedError("addVideo", error),
  );
  if (result.kind === "added") revalidatePath("/library");
  return result;
}

async function saveVideo(youtubeId: string, confirmLong: boolean): Promise<AddVideoResult> {
  // Checked before asking YouTube, so re-adding a saved video costs no quota.
  const existing = await getVideoByYoutubeId(youtubeId);
  if (existing) {
    return { kind: "already_exists", youtubeId, title: existing.title };
  }

  const lookup = await fetchVideoMetadata(youtubeId);
  if (!lookup.ok) {
    switch (lookup.error) {
      case "not_found":
      case "live_or_upcoming":
      case "quota_exceeded":
        return { kind: lookup.error };
      default:
        console.error(`addVideo: YouTube lookup failed (${lookup.error}): ${lookup.detail}`);
        return actionError(youTubeErrorMessage(lookup.error));
    }
  }

  const { video } = lookup;
  if (video.durationSeconds > LONG_VIDEO_WARNING_SECONDS && !confirmLong) {
    return {
      kind: "needs_confirmation",
      title: video.title,
      durationSeconds: video.durationSeconds,
    };
  }

  const inserted = await insertVideo({
    youtubeId,
    title: video.title,
    channel: video.channel,
    durationSeconds: video.durationSeconds,
    publishedAt: video.publishedAt,
    privacyStatus: video.privacyStatus,
    status: "pending",
  });
  // Null means another add of the same video got there first.
  return inserted
    ? { kind: "added", youtubeId, title: video.title }
    : { kind: "already_exists", youtubeId, title: video.title };
}

/**
 * Deletes a video with its transcript, its search index and the chats about
 * it. Library answers that cited it keep their saved sources.
 */
export async function deleteVideo(youtubeId: string): Promise<DeleteVideoResult> {
  if (!(await getSession())) return actionError(SIGNED_OUT);
  const parsed = youtubeIdSchema.safeParse(youtubeId);
  if (!parsed.success) return actionError("That isn't a saved video.");

  try {
    // Already gone, say because the other person deleted it first, is fine too.
    await deleteVideoByYoutubeId(parsed.data);
  } catch (error) {
    return unexpectedError("deleteVideo", error, "Couldn't delete the video. Try again.");
  }
  revalidatePath("/library");
  return { kind: "deleted" };
}

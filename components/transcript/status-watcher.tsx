"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { fetchTranscriptStatuses, requestTranscript } from "@/lib/transcript/client";

// Most transcripts arrive within seconds, so poll quickly for the first
// minute, then ease off.
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 10_000;
const FAST_POLL_FOR_MS = 60_000;

export type WatchedVideo = {
  youtubeId: string;
  /** Whether processing has started, going by the video's claim. */
  started: boolean;
};

/**
 * Watches videos whose transcripts are still processing and refreshes the
 * page as each one finishes. A pending video that was never started, say
 * because its tab closed right after adding it, is started here, once.
 * Renders nothing.
 */
export function TranscriptStatusWatcher({ videos }: { videos: WatchedVideo[] }) {
  const router = useRouter();
  const requested = useRef(new Set<string>());

  // Keyed on the IDs, so a refresh that leaves the same videos pending
  // doesn't restart the polling.
  const watchedIds = videos.map((video) => video.youtubeId).join(",");
  const unstartedIds = videos
    .filter((video) => !video.started)
    .map((video) => video.youtubeId)
    .join(",");

  useEffect(() => {
    for (const youtubeId of splitIds(unstartedIds)) {
      if (requested.current.has(youtubeId)) continue;
      requested.current.add(youtubeId);
      void requestTranscript(youtubeId);
    }
  }, [unstartedIds]);

  useEffect(() => {
    const watching = new Set(splitIds(watchedIds));
    if (watching.size === 0) return;

    const since = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function poll() {
      const statuses = await fetchTranscriptStatuses([...watching]);
      if (stopped) return;
      if (statuses) {
        const pending = new Set(
          statuses.filter((video) => video.status === "pending").map((video) => video.youtubeId),
        );
        let changed = false;
        for (const youtubeId of watching) {
          // Finished, stalled or deleted.
          if (!pending.has(youtubeId)) {
            watching.delete(youtubeId);
            changed = true;
          }
        }
        if (changed) router.refresh();
      }
      if (watching.size > 0) {
        timer = setTimeout(poll, Date.now() - since < FAST_POLL_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
      }
    }

    timer = setTimeout(poll, FAST_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [watchedIds, router]);

  return null;
}

function splitIds(ids: string): string[] {
  return ids ? ids.split(",") : [];
}

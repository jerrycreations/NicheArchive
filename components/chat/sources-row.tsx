"use client";

import { SourceCard } from "@/components/chat/source-card";
import type { MessageSourceVideo } from "@/lib/db/types";

/**
 * The "Found in" row under a library answer: a card for each video it drew
 * on, in citation order, scrolling sideways when they don't fit.
 */
export function SourcesRow({
  videos,
  deletedYoutubeIds,
}: {
  videos: readonly MessageSourceVideo[];
  /** Cited videos that have been deleted since. */
  deletedYoutubeIds: ReadonlySet<string>;
}) {
  if (videos.length === 0) return null;
  return (
    <section aria-label="Found in" className="mt-3 flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">Found in</h3>
      {/* Relative, so the cards' screen-reader labels scroll and clip with them. */}
      <ul className="relative flex gap-2 overflow-x-auto pb-1">
        {videos.map((video) => (
          <li key={video.index} className="flex">
            <SourceCard source={video} deleted={deletedYoutubeIds.has(video.youtubeId)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

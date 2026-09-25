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
      {/* Relative, so the cards' screen-reader labels scroll and clip with them.
          Cards are 16rem, or less on a narrow phone so the next one peeks out. */}
      <ul className="relative flex snap-x gap-2 overflow-x-auto pb-1">
        {videos.map((video) => (
          <li key={video.index} className="flex w-64 max-w-[85%] shrink-0 snap-start">
            <SourceCard source={video} deleted={deletedYoutubeIds.has(video.youtubeId)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

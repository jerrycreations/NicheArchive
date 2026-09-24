import { VideoCard, VideoCardSkeleton } from "@/components/library/video-card";
import type { VideoListItem } from "@/lib/db/types";

// One column on phones, then 2, 3 and 4 as the screen widens.
const GRID = "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function VideoGrid({ videos }: { videos: VideoListItem[] }) {
  return (
    <ul className={GRID}>
      {videos.map((video) => (
        <li key={video.id}>
          <VideoCard video={video} />
        </li>
      ))}
    </ul>
  );
}

/** The grid while it loads, shaped like the real one so nothing jumps. */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className={GRID} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <VideoCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

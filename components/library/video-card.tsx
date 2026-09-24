import Image from "next/image";
import Link from "next/link";
import { LocalDate } from "@/components/common/local-date";
import { TranscriptStatusBadge } from "@/components/library/transcript-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoActionsMenu } from "@/components/video/video-actions-menu";
import type { VideoListItem } from "@/lib/db/types";
import { videoPath } from "@/lib/navigation";
import { formatDuration } from "@/lib/time";
import { buildThumbnailUrl } from "@/lib/youtube/url";

// The grid's column widths, so the browser knows how wide a thumbnail shows.
const THUMBNAIL_SIZES =
  "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

/**
 * One video in the library grid. The title's link stretches over the whole
 * card, so the actions menu sits on top of it instead of inside a link,
 * where a button isn't allowed.
 */
export function VideoCard({ video }: { video: VideoListItem }) {
  return (
    <article className="group relative flex flex-col gap-3 rounded-lg outline-offset-4 has-[a:focus-visible]:outline-2">
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
        {/* YouTube already serves sized JPEGs, so Vercel's optimizer is skipped. */}
        <Image
          src={buildThumbnailUrl(video.youtubeId)}
          alt=""
          fill
          unoptimized
          sizes={THUMBNAIL_SIZES}
          className="object-cover transition-opacity group-hover:opacity-85"
        />
        <span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black/80 px-1 py-0.5 text-xs font-medium text-white tabular-nums">
          {formatDuration(video.durationSeconds)}
        </span>
      </div>
      <div className="flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="line-clamp-2 leading-snug font-medium">
            <Link
              href={videoPath(video.youtubeId)}
              className="outline-none after:absolute after:inset-0"
            >
              {video.title}
            </Link>
          </h2>
          <p className="truncate text-sm text-muted-foreground">{video.channel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <TranscriptStatusBadge status={video.status} />
            <span>
              Added <LocalDate value={video.createdAt} />
            </span>
          </div>
        </div>
        <VideoActionsMenu
          youtubeId={video.youtubeId}
          title={video.title}
          chatCount={video.chatCount}
          className="relative z-10 -mt-0.5 -mr-1.5 shrink-0"
        />
      </div>
    </article>
  );
}

/** A placeholder with the card's shape, for loading states. */
export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-video rounded-lg" />
      <div className="flex flex-col gap-1">
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-0.5 h-4 w-1/2" />
        <div className="mt-1 flex gap-2">
          <Skeleton className="h-5 w-20 rounded-4xl" />
          <Skeleton className="h-5 w-28" />
        </div>
      </div>
    </div>
  );
}

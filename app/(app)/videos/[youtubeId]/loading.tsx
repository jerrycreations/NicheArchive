import { Skeleton } from "@/components/ui/skeleton";
import { VideoPageSkeleton } from "@/components/video/video-page-layout";

/** The video page while it loads: VideoMeta's shape, then the layout's. */
export default function VideoLoading() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        Loading the video…
      </p>
      <div className="flex items-start gap-2" aria-hidden>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex h-7 items-center sm:h-8">
            <Skeleton className="h-5 w-3/4 sm:h-6" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
        {/* Where the actions menu goes. */}
        <div className="-mr-1.5 size-7 shrink-0" />
      </div>
      <VideoPageSkeleton />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";
import { VideoPageSkeleton } from "@/components/video/video-page-layout";

export default function VideoLoading() {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        Loading the video…
      </p>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-3/4 sm:h-8" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <VideoPageSkeleton />
    </div>
  );
}

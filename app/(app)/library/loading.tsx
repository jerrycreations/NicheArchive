import { VideoGridSkeleton } from "@/components/library/video-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading your library…
      </p>
      <div className="flex items-baseline gap-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>
      <VideoGridSkeleton />
    </div>
  );
}

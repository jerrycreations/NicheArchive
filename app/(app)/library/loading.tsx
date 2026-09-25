import { VideoGridSkeleton } from "@/components/library/video-grid";
import { Skeleton } from "@/components/ui/skeleton";

/** The library while it loads, laid out like LibraryToolbar and the grid. */
export default function LibraryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Loading your library…
      </p>
      <div className="flex flex-wrap items-center gap-3" aria-hidden>
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <p className="text-2xl font-semibold tracking-tight">Library</p>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:order-last">
          {/* "Download all", icon only on phones, then the menu's room. */}
          <Skeleton className="h-8 w-9 sm:w-32" />
          <div className="size-7" />
        </div>
        <div className="flex w-full items-center gap-2 lg:w-auto">
          <Skeleton className="h-8 min-w-0 flex-1 sm:max-w-sm lg:w-72 lg:flex-none" />
          <Skeleton className="h-8 w-29 shrink-0" />
        </div>
      </div>
      <VideoGridSkeleton />
    </div>
  );
}

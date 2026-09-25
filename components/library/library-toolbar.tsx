import { DownloadAllButton } from "@/components/library/download-all-button";
import { LibraryControls } from "@/components/library/library-controls";
import { LibraryMenu } from "@/components/library/library-menu";
import type { VideoSort } from "@/lib/validation/video";

/**
 * The library's header: title and count, search and sort, "Download all" and
 * the library menu. One row on wide screens; on narrower ones the search and
 * sort move to a row of their own.
 */
export function LibraryToolbar({
  q,
  sort,
  shown,
  total,
}: {
  q: string;
  sort: VideoSort;
  /** Videos matching the search, or all of them. */
  shown: number;
  /** Videos in the library. */
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="truncate text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {q ? `${shown} of ${videoCount(total)}` : videoCount(total)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 lg:order-last">
        <DownloadAllButton />
        <LibraryMenu />
      </div>
      <LibraryControls q={q} sort={sort} className="flex w-full items-center gap-2 lg:w-auto" />
    </div>
  );
}

function videoCount(count: number): string {
  return count === 1 ? "1 video" : `${count} videos`;
}

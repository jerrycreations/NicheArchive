import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { libraryPath } from "@/lib/navigation";
import type { VideoSort } from "@/lib/validation/video";

/** A search that matched nothing, as opposed to a library with no videos. */
export function NoResults({ q, sort }: { q: string; sort: VideoSort }) {
  const heading = `No videos match “${q}”`;
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed px-4 py-16 text-center sm:px-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <SearchXIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-lg font-medium break-words">{heading}</h2>
        <p className="text-sm text-muted-foreground">
          Search looks for words in titles, channels and transcripts. Try fewer or different
          words.
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={libraryPath({ sort })} replace scroll={false}>
          Clear search
        </Link>
      </Button>
    </div>
  );
}

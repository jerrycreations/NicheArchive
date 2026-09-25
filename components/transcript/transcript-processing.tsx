import { LoaderCircleIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The transcript panel while the transcript is being fetched: laid out like
 * the viewer, with the status where the source label goes, so nothing jumps
 * when the transcript arrives.
 */
export function TranscriptProcessing() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-medium">Transcript</h2>
        <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-3.5 animate-spin text-status-processing" aria-hidden />
          Getting the transcript…
        </p>
      </div>
      <TranscriptSkeleton />
    </section>
  );
}

// Varied last-line widths, so the placeholder reads as text.
const LAST_LINE_WIDTHS = ["w-2/3", "w-11/12", "w-1/2", "w-4/5", "w-3/5", "w-5/6"];

/** Placeholder transcript lines: a timestamp and two lines of text each. */
export function TranscriptSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {LAST_LINE_WIDTHS.map((width, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="mt-1 h-4 w-8 shrink-0" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className={cn("h-4", width)} />
          </div>
        </div>
      ))}
    </div>
  );
}

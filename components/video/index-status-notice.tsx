"use client";

import { RotateCwIcon, SearchXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestIndex } from "@/lib/search/reindex-client";

/**
 * A quiet note that a ready video's library search index couldn't be built,
 * with a retry. The transcript itself is fine; the video just can't turn up
 * in "All my videos" answers yet.
 */
export function IndexStatusNotice({
  youtubeId,
  indexError,
}: {
  youtubeId: string;
  indexError: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const response = await requestIndex(youtubeId);
      if (response === null) {
        toast.error("Couldn't reach the server. Try again.");
        return;
      }
      if (response.outcome === "indexed") toast.success("Library search can find this video now.");
      if (response.outcome === "failed") toast.error(response.message);
      if (response.outcome === "not_found") toast.error("This video isn't in the library anymore.");
      // A refresh after an await needs its own transition to keep `pending` true until it lands.
      startTransition(() => router.refresh());
    });
  }

  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <SearchXIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">Library search index failed</p>
        {/* One string: split over lines, this text rendered with different spacing on the server and the client. */}
        <p className="text-muted-foreground">
          {`${indexError} Until it's indexed, this video won't turn up in “All my videos” answers.`}
        </p>
      </div>
      <Button variant="outline" size="xs" disabled={pending} onClick={retry}>
        <RotateCwIcon data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
        {pending ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}

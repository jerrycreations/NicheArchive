import { ComposerSkeleton } from "@/components/chat/composer";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A new chat's shape while the Chats page loads: the mode selector, the
 * intro and the composer. An open chat has its own (chats/[id]/loading.tsx),
 * and the list beside both loads on its own.
 */
export default function ChatsLoading() {
  return (
    <div className="flex h-full flex-col rounded-lg border">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="border-b p-3" aria-hidden>
        <Skeleton className="h-7 w-full" />
      </div>
      <div className="min-h-0 flex-1 p-4" aria-hidden>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-1">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-28" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        </div>
      </div>
      <ComposerSkeleton />
    </div>
  );
}

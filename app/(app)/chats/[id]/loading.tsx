import { ComposerSkeleton } from "@/components/chat/composer";
import { Skeleton } from "@/components/ui/skeleton";

/** An open chat's shape while it loads: ChatHeader, a question and answer, the composer. */
export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border">
      <p role="status" className="sr-only">
        Loading the chat…
      </p>
      <div className="flex items-start gap-2 border-b py-2 pr-2 pl-4" aria-hidden>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex h-7 items-center">
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-40 max-w-full" />
          </div>
        </div>
        {/* Where the chat's menu goes. */}
        <div className="mt-0.5 size-7 shrink-0" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
          <Skeleton className="ml-auto h-10 w-3/5 max-w-[85%] rounded-2xl rounded-br-sm" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
      <ComposerSkeleton />
    </div>
  );
}

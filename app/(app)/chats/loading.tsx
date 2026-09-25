import { Skeleton } from "@/components/ui/skeleton";

/** An open chat's shape while it loads; the list beside it loads on its own. */
export default function ChatLoading() {
  return (
    <div className="flex h-full flex-col rounded-lg border">
      <p role="status" className="sr-only">
        Loading the chat…
      </p>
      <div className="flex flex-col gap-1.5 border-b px-4 py-3">
        <Skeleton className="h-5 w-56 max-w-full" />
        <Skeleton className="h-3 w-40 max-w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-5 overflow-hidden p-4">
        <Skeleton className="ml-auto h-10 w-3/5 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="border-t p-3">
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}

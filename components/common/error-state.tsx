"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DATABASE_UNREACHABLE } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * A failure shown in place of what couldn't load, with a Retry button. Retry
 * calls `retry` (an error boundary's) or else re-renders the page from the
 * server.
 */
export function ErrorState({
  title,
  message,
  retry,
  digest,
  heading: Heading = "h1",
  compact = false,
  children,
  className,
}: {
  title: string;
  message: string;
  retry?: () => void;
  /** Next's ID for a server error, which matches it to the server logs. */
  digest?: string;
  /** h1 when this stands in for a whole page. */
  heading?: "h1" | "h2";
  /** Smaller, for a column rather than a page. */
  compact?: boolean;
  /** More actions beside Retry. */
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed text-center",
        compact ? "px-3 py-8" : "px-4 py-16 sm:px-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-status-failed/15",
          compact ? "size-9" : "size-12",
        )}
      >
        <TriangleAlertIcon
          className={cn("text-status-failed", compact ? "size-4.5" : "size-6")}
          aria-hidden
        />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Heading className={cn("font-medium", compact ? "text-base" : "text-lg")}>{title}</Heading>
        <p className="text-sm text-muted-foreground">{message}</p>
        {digest && (
          <p className="mt-1 text-xs text-muted-foreground">
            Error ID <code className="font-mono">{digest}</code>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => (retry ? retry() : router.refresh()))}
        >
          <RotateCwIcon data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
          {pending ? "Retrying…" : "Retry"}
        </Button>
        {children}
      </div>
    </div>
  );
}

/** A page, or part of one, that couldn't load because Postgres is out of reach. */
export function DatabaseUnavailable({
  heading,
  compact,
  className,
}: {
  heading?: "h1" | "h2";
  compact?: boolean;
  className?: string;
}) {
  return (
    <ErrorState
      title="Can't load this"
      message={DATABASE_UNREACHABLE}
      heading={heading}
      compact={compact}
      className={className}
    />
  );
}

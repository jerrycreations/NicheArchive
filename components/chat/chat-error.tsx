"use client";

import { CircleAlertIcon, RotateCwIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Why the last question failed, with a Retry that sends it again. */
export function ChatError({
  message,
  onRetry,
  onDismiss,
  className,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive",
        className,
      )}
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <Button type="button" size="xs" variant="outline" onClick={onRetry} className="text-foreground">
          <RotateCwIcon />
          Retry
        </Button>
      )}
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 text-muted-foreground"
      >
        <XIcon />
      </Button>
    </div>
  );
}

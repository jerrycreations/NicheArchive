"use client";

import { RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestTranscript } from "@/lib/transcript/client";

/**
 * Tries the automatic transcript sources again for a failed video, then
 * refreshes the page, which then shows it processing.
 */
export function RetryTranscriptButton({
  youtubeId,
  size = "sm",
  className,
}: {
  youtubeId: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const outcome = await requestTranscript(youtubeId);
      if (outcome === null) {
        toast.error("Couldn't start the transcript again. Try again.");
        return;
      }
      if (outcome === "not_found") toast.error("This video isn't in the library anymore.");
      // A refresh after an await needs its own transition to keep `pending` true until it lands.
      startTransition(() => router.refresh());
    });
  }

  return (
    <Button variant="outline" size={size} disabled={pending} onClick={retry} className={className}>
      <RotateCwIcon data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
      {pending ? "Retrying…" : "Retry"}
    </Button>
  );
}

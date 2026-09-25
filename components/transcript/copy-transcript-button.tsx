"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies the transcript as plain paragraphs, without timestamps. */
export function CopyTranscriptButton({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Transcript copied");
    } catch {
      // No clipboard access, say in an insecure context or when it's refused.
      toast.error("Couldn't copy the transcript. Try again.");
    }
  }

  return (
    <Button variant="outline" size="sm" aria-label="Copy transcript" onClick={copy}>
      <CopyIcon data-icon="inline-start" />
      Copy
    </Button>
  );
}

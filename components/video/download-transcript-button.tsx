"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { fetchTranscriptFile } from "@/lib/export/client";
import { saveBlob } from "@/lib/export/save-blob";

/**
 * Downloads this video's transcript as a .txt file, the same as its file in
 * "Download all". Styled as a link, to sit in the video page's header line.
 */
export function DownloadTranscriptButton({ youtubeId }: { youtubeId: string }) {
  const [pending, startTransition] = useTransition();

  function download() {
    startTransition(async () => {
      const file = await fetchTranscriptFile(youtubeId);
      if ("error" in file) {
        toast.error(file.error);
        return;
      }
      saveBlob(file.blob, file.filename);
    });
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={pending}
      className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
    >
      Download transcript
      {pending ? (
        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <DownloadIcon className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

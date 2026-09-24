import { ExternalLinkIcon } from "lucide-react";
import { RetryTranscriptButton } from "@/components/transcript/retry-button";
import { Separator } from "@/components/ui/separator";
import { PasteTranscriptForm } from "@/components/video/paste-transcript-form";
import { parseStageReasons } from "@/lib/transcript/status";
import { TRANSCRIPT_SITE_NAME, TRANSCRIPT_SITE_URL } from "@/lib/youtube/links";
import { buildWatchUrl } from "@/lib/youtube/url";

/**
 * A video's transcript panel when no automatic source worked: why each one
 * failed, a retry, and the manual route of copying the transcript from
 * youtubetotranscript.com and pasting it here.
 */
export function TranscriptFailed({
  youtubeId,
  errorMessage,
}: {
  youtubeId: string;
  errorMessage: string | null;
}) {
  const reasons = errorMessage ? parseStageReasons(errorMessage) : [];

  return (
    <section className="flex flex-col gap-5 rounded-lg border p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium text-status-failed">
            Couldn&apos;t get the transcript automatically
          </h2>
          {reasons.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {reasons.map((reason, index) => (
                <li key={index}>
                  {reason.label && (
                    <span className="font-medium text-foreground">{reason.label}: </span>
                  )}
                  {reason.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <RetryTranscriptButton youtubeId={youtubeId} />
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Paste it yourself</h3>
          <p className="text-sm text-muted-foreground">
            Open {TRANSCRIPT_SITE_NAME}, enter this video&apos;s link,{" "}
            <span className="font-mono text-xs break-all text-foreground select-all">
              {buildWatchUrl(youtubeId)}
            </span>
            , then copy the transcript it shows and paste it below.
          </p>
        </div>
        <div>
          <a
            href={TRANSCRIPT_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
          >
            Open {TRANSCRIPT_SITE_NAME}
            <ExternalLinkIcon className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
        <PasteTranscriptForm youtubeId={youtubeId} />
      </div>
    </section>
  );
}

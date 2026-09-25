import { ExternalLinkIcon } from "lucide-react";
import { LocalDate } from "@/components/common/local-date";
import { DownloadTranscriptButton } from "@/components/video/download-transcript-button";
import { VideoActionsMenu } from "@/components/video/video-actions-menu";
import type { VideoDetail } from "@/lib/db/types";
import { formatDuration } from "@/lib/time";
import { buildWatchUrl } from "@/lib/youtube/url";

/**
 * The video page's header: title, channel, dates, a link to YouTube, a
 * transcript download once the transcript is ready, and the actions menu.
 */
export function VideoMeta({
  video,
}: {
  video: Pick<
    VideoDetail,
    "youtubeId" | "title" | "channel" | "publishedAt" | "durationSeconds" | "chatCount" | "status"
  >;
}) {
  return (
    <header className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {video.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{video.channel}</span>
          <Dot />
          <span>
            Published <LocalDate value={video.publishedAt} />
          </span>
          <Dot />
          <span className="tabular-nums">
            <span className="sr-only">Length </span>
            {formatDuration(video.durationSeconds)}
          </span>
          <Dot />
          <a
            href={buildWatchUrl(video.youtubeId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            Open on YouTube
            <ExternalLinkIcon className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {video.status === "ready" && (
            <>
              <Dot />
              <DownloadTranscriptButton youtubeId={video.youtubeId} />
            </>
          )}
        </p>
      </div>
      <VideoActionsMenu
        youtubeId={video.youtubeId}
        title={video.title}
        chatCount={video.chatCount}
        className="-mr-1.5 shrink-0"
      />
    </header>
  );
}

function Dot() {
  return <span aria-hidden>·</span>;
}

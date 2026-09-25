import { TranscriptStatusWatcher } from "@/components/transcript/status-watcher";
import { TranscriptProcessing } from "@/components/transcript/transcript-processing";
import { TranscriptViewer } from "@/components/transcript/transcript-viewer";
import { IndexStatusNotice } from "@/components/video/index-status-notice";
import { TranscriptFailed } from "@/components/video/transcript-failed";
import type { VideoDetail } from "@/lib/db/types";

/**
 * The video page's transcript, in whichever state it's in: still processing
 * (watched until it finishes), failed with a paste fallback, or ready, with
 * a note when its library search index couldn't be built.
 */
export function TranscriptPanel({ video }: { video: VideoDetail }) {
  switch (video.status) {
    case "pending":
      return (
        <>
          <TranscriptStatusWatcher
            videos={[{ youtubeId: video.youtubeId, started: video.processingStartedAt !== null }]}
          />
          <TranscriptProcessing />
        </>
      );
    case "failed":
      return <TranscriptFailed youtubeId={video.youtubeId} errorMessage={video.errorMessage} />;
    case "ready":
      return (
        <div className="flex flex-col gap-4">
          {video.indexError && (
            <IndexStatusNotice youtubeId={video.youtubeId} indexError={video.indexError} />
          )}
          <TranscriptViewer
            segments={video.transcriptSegments ?? []}
            text={video.transcriptText ?? ""}
            source={video.transcriptSource}
            timestampsEstimated={video.timestampsEstimated}
          />
        </div>
      );
  }
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { EmptyLibrary } from "@/components/library/empty-library";
import { LibraryMenu } from "@/components/library/library-menu";
import { VideoGrid } from "@/components/library/video-grid";
import { TranscriptStatusWatcher } from "@/components/transcript/status-watcher";
import { listVideos } from "@/lib/db/queries/videos";

export const metadata: Metadata = {
  title: "Library",
};

export default async function LibraryPage() {
  // Database reads don't make a page dynamic on their own, so without this
  // `next build` would render the library once, at build time.
  await connection();
  const videos = await listVideos();
  const processing = videos
    .filter((video) => video.status === "pending")
    .map((video) => ({
      youtubeId: video.youtubeId,
      started: video.processingStartedAt !== null,
    }));

  return (
    <div className="flex flex-col gap-6">
      <TranscriptStatusWatcher videos={processing} />
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          {videos.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {videos.length === 1 ? "1 video" : `${videos.length} videos`}
            </p>
          )}
        </div>
        {videos.length > 0 && <LibraryMenu />}
      </div>
      {videos.length === 0 ? <EmptyLibrary /> : <VideoGrid videos={videos} />}
    </div>
  );
}

import type { Metadata } from "next";
import { connection } from "next/server";
import { DatabaseUnavailable } from "@/components/common/error-state";
import { EmptyLibrary } from "@/components/library/empty-library";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { NoResults } from "@/components/library/no-results";
import { VideoGrid } from "@/components/library/video-grid";
import { TranscriptStatusWatcher } from "@/components/transcript/status-watcher";
import { countVideos, listVideos } from "@/lib/db/queries/videos";
import { unlessDatabaseDown } from "@/lib/errors";
import { librarySearchParamsSchema } from "@/lib/validation/library";

export const metadata: Metadata = {
  title: "Library",
};

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  // Database reads don't make a page dynamic on their own, so without this
  // `next build` would render the library once, at build time.
  await connection();
  const { q, sort } = librarySearchParamsSchema.parse(await searchParams);
  // A search shows only some videos, so it also needs the library's size.
  const loaded = await unlessDatabaseDown(() =>
    Promise.all([listVideos({ q, sort }), q ? countVideos() : null]),
  );
  if (!loaded.ok) return <DatabaseUnavailable />;
  const [videos, total] = loaded.value;
  const libraryCount = total ?? videos.length;
  const processing = videos
    .filter((video) => video.status === "pending")
    .map((video) => ({
      youtubeId: video.youtubeId,
      started: video.processingStartedAt !== null,
    }));

  return (
    <div className="flex flex-col gap-6">
      <TranscriptStatusWatcher videos={processing} />
      {libraryCount === 0 ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <EmptyLibrary />
        </>
      ) : (
        <>
          <LibraryToolbar q={q} sort={sort} shown={videos.length} total={libraryCount} />
          {videos.length === 0 ? <NoResults q={q} sort={sort} /> : <VideoGrid videos={videos} />}
        </>
      )}
    </div>
  );
}

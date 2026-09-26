import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DatabaseUnavailable } from "@/components/common/error-state";
import { PlayerProvider } from "@/components/player/player-provider";
import { YouTubePlayer } from "@/components/player/youtube-player";
import { TranscriptPanel } from "@/components/video/transcript-panel";
import { VideoChat } from "@/components/video/video-chat";
import { VideoMeta } from "@/components/video/video-meta";
import { VideoPageLayout } from "@/components/video/video-page-layout";
import { pageSession } from "@/lib/auth/require-session";
import { toUIMessages } from "@/lib/chat/messages";
import { listChatsForVideo } from "@/lib/db/queries/chats";
import { listMessages } from "@/lib/db/queries/messages";
import { getVideoDetail } from "@/lib/db/queries/videos";
import { unlessDatabaseDown } from "@/lib/errors";
import { parseStartParam } from "@/lib/navigation";
import { isVideoId } from "@/lib/youtube/url";

// Shared by the metadata and the page within one request.
const loadVideo = cache(async (youtubeId: string) =>
  isVideoId(youtubeId) ? getVideoDetail(youtubeId) : null,
);

export async function generateMetadata({
  params,
}: PageProps<"/videos/[youtubeId]">): Promise<Metadata> {
  const { youtubeId } = await params;
  const loaded = await unlessDatabaseDown(() => loadVideo(youtubeId));
  if (!loaded.ok) return { title: "Video" };
  return { title: loaded.value?.title ?? "Video not found" };
}

export default async function VideoPage({ params, searchParams }: PageProps<"/videos/[youtubeId]">) {
  // Database reads don't make a page dynamic on their own (see the library page).
  await connection();
  const { person } = await pageSession();
  const { youtubeId } = await params;
  const loaded = await unlessDatabaseDown(async () => {
    const video = await loadVideo(youtubeId);
    if (!video) return null;
    // The chat column opens your most recent chat about it.
    const chats = await listChatsForVideo(video.id, person);
    const latestMessages = chats[0] ? toUIMessages(await listMessages(chats[0].id)) : [];
    return { video, chats, latestMessages };
  });
  if (!loaded.ok) return <DatabaseUnavailable />;
  if (!loaded.value) notFound();
  const { video, chats, latestMessages } = loaded.value;

  const { t } = await searchParams;
  const startSeconds = parseStartParam(t, video.durationSeconds);

  return (
    // Keyed, so moving to another video starts a fresh player.
    <PlayerProvider key={video.youtubeId}>
      <div className="flex flex-col gap-4">
        <VideoMeta video={video} />
        <VideoPageLayout
          player={
            <YouTubePlayer
              youtubeId={video.youtubeId}
              title={video.title}
              startSeconds={startSeconds}
            />
          }
          transcript={<TranscriptPanel video={video} />}
          chat={
            <VideoChat
              youtubeId={video.youtubeId}
              status={video.status}
              chats={chats.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))}
              latestMessages={latestMessages}
              now={new Date()}
            />
          }
        />
      </div>
    </PlayerProvider>
  );
}

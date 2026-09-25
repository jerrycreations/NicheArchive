import type { Metadata } from "next";
import { connection } from "next/server";
import { NewChat } from "@/components/chats/new-chat";
import { CHAT_MODES, type ChatMode } from "@/lib/chat/types";
import { listVideoOptions } from "@/lib/db/queries/videos";
import type { VideoOption } from "@/lib/db/types";

export const metadata: Metadata = {
  title: "Chats",
};

/** A new chat, asking across all videos unless the address says otherwise. */
export default async function ChatsPage({ searchParams }: PageProps<"/chats">) {
  // Database reads don't make a page dynamic on their own (see the library page).
  await connection();
  const [params, videos] = await Promise.all([searchParams, listVideoOptions()]);
  const { mode, youtubeId } = preselection(params, videos);

  // Keyed, so following a link with another preselection starts over.
  return (
    <NewChat
      key={`${mode}:${youtubeId ?? ""}`}
      videos={videos}
      initialMode={mode}
      initialYoutubeId={youtubeId}
    />
  );
}

/**
 * What `?mode=` and `?video=` choose, as in `?mode=video&video=<youtubeId>`.
 * An unknown mode falls back to All my videos, and an unknown video to none.
 */
function preselection(
  params: Record<string, string | string[] | undefined>,
  videos: VideoOption[],
): { mode: ChatMode; youtubeId?: string } {
  const mode = CHAT_MODES.find((option) => option === params.mode) ?? "library";
  if (mode !== "video") return { mode };
  const youtubeId = videos.find((video) => video.youtubeId === params.video)?.youtubeId;
  return { mode, youtubeId };
}

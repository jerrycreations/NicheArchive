"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { StarterPrompts } from "@/components/chat/starter-prompts";
import { ChatModeLine } from "@/components/chats/chat-header";
import { ModeSelector } from "@/components/chats/mode-selector";
import { VideoPicker } from "@/components/chats/video-picker";
import {
  CHAT_MODE_LABELS,
  CHAT_MODE_PLACEHOLDERS,
  LIBRARY_CHAT_UNAVAILABLE,
} from "@/lib/chat/modes";
import { carryComposerFocus } from "@/lib/chat/composer-focus";
import { takePendingStart } from "@/lib/chat/pending-start";
import type { ChatMode } from "@/lib/chat/types";
import type { VideoOption } from "@/lib/db/types";
import { chatPath } from "@/lib/navigation";

const INTROS: Record<ChatMode, string> = {
  video: "Answers come from the video's transcript, with timestamps that open it at that moment.",
  library: "Gemini finds the videos in your library that match your question and answers from them.",
  general: "Gemini answers from general knowledge, without your transcripts.",
};

/**
 * The Chats page's new chat: choose what to ask about, then ask. The first
 * question creates the chat. Once its answer is in and saved, the address
 * becomes the chat's own and the page refreshes into the chat's page, as if
 * it had been opened from the list. Nothing remounts while the answer streams.
 */
export function NewChat({
  videos,
  initialMode,
  initialYoutubeId,
}: {
  /** Every video, for One video; only ready ones can be chosen. */
  videos: VideoOption[];
  initialMode: ChatMode;
  initialYoutubeId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [youtubeId, setYoutubeId] = useState(initialYoutubeId);
  const [startWith, setStartWith] = useState<string>();

  // A first question another page left to send here (Step 43). Read after
  // hydration, since the server can't see sessionStorage.
  useEffect(() => {
    const pending = takePendingStart();
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting a one-time handoff from storage
    setMode(pending.mode);
    setYoutubeId(pending.youtubeId);
    setStartWith(pending.question);
  }, []);

  const video = mode === "video" ? videos.find((option) => option.youtubeId === youtubeId) : undefined;
  const blocked = blockedReason(mode, video, videos.length);

  return (
    <ChatPanel
      mode={mode}
      youtubeId={video?.youtubeId}
      disabled={blocked !== null}
      notice={blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
      placeholder={CHAT_MODE_PLACEHOLDERS[mode]}
      startWith={startWith}
      renderHeader={({ started }) => (
        <div className="flex flex-col gap-3 border-b p-3">
          <h1 className={started ? "px-1 leading-7 font-medium" : "sr-only"}>New chat</h1>
          {started ? (
            // What the chat is about can't change once it's asked.
            <div className="-mt-3 px-1">
              <ChatModeLine mode={mode} video={video ?? null} />
            </div>
          ) : (
            <>
              <ModeSelector value={mode} onChange={setMode} />
              {mode === "video" && (
                <VideoPicker videos={videos} value={youtubeId} onChange={setYoutubeId} />
              )}
            </>
          )}
        </div>
      )}
      renderEmpty={(send) =>
        mode === "video" && video?.status === "ready" ? (
          <StarterPrompts onSelect={send} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{CHAT_MODE_LABELS[mode]}</p>
            <p className="text-sm text-muted-foreground">{INTROS[mode]}</p>
          </div>
        )
      }
      onReplyFinished={({ chatId, first }) => {
        if (first) {
          // Saved now, so the chat's own address works. The refresh below
          // then renders its page in place of this one, with its title.
          window.history.replaceState(null, "", chatPath(chatId));
          if (document.activeElement instanceof HTMLTextAreaElement) carryComposerFocus(chatId);
        }
        // Brings the chat into the list.
        router.refresh();
      }}
      className="h-full rounded-lg border"
    />
  );
}

/** Why nothing can be asked yet, or null when it can. */
function blockedReason(
  mode: ChatMode,
  video: VideoOption | undefined,
  videoCount: number,
): string | null {
  if (mode === "library") return LIBRARY_CHAT_UNAVAILABLE;
  if (mode !== "video") return null;
  if (videoCount === 0) return "Add a video to the library first.";
  if (!video) return "Choose a video to ask about.";
  if (video.status !== "ready") return "That video's transcript isn't ready yet.";
  return null;
}

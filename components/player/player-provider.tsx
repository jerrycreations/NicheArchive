"use client";

import { useRef, useState } from "react";
import { PlayerContext, type PlayerContextValue, type PlayerHandle } from "@/lib/player/use-player";

/**
 * Lets anything on a video page seek its player, such as transcript
 * timestamps and, later, timestamps in chat answers. The YouTubePlayer inside
 * registers itself here.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const handleRef = useRef<PlayerHandle | null>(null);
  const [ready, setReady] = useState(false);

  // Declared apart from `value` so they keep their identity when `ready` changes.
  function seekTo(seconds: number) {
    handleRef.current?.seekTo(seconds);
  }
  function register(handle: PlayerHandle | null) {
    handleRef.current = handle;
  }

  const value: PlayerContextValue = { ready, seekTo, register, setReady };

  return <PlayerContext value={value}>{children}</PlayerContext>;
}

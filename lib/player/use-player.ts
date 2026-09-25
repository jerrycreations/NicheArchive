import { createContext, use } from "react";

/** What a mounted player offers the page around it. */
export type PlayerHandle = {
  /** Jumps to `seconds` and plays. */
  seekTo(seconds: number): void;
};

export type PlayerContextValue = {
  ready: boolean;
  seekTo(seconds: number): void;
  /** For YouTubePlayer only: connects its handle, or null when it unmounts. */
  register(handle: PlayerHandle | null): void;
  /** For YouTubePlayer only. */
  setReady(ready: boolean): void;
};

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export type PlayerControls = {
  /** Whether a player is on this page. Timestamps elsewhere link to the video's page instead. */
  available: boolean;
  /** Whether the player can seek right now. Seeks made before then are applied once it can. */
  ready: boolean;
  seekTo(seconds: number): void;
};

const NO_PLAYER: PlayerControls = {
  available: false,
  ready: false,
  seekTo() {},
};

/** The page's video player. Outside a PlayerProvider, seeking does nothing. */
export function usePlayer(): PlayerControls {
  const context = use(PlayerContext);
  if (!context) return NO_PLAYER;
  return { available: true, ready: context.ready, seekTo: context.seekTo };
}

/** How YouTubePlayer connects itself to the PlayerProvider around it. */
export function usePlayerRegistration(): Pick<PlayerContextValue, "register" | "setReady"> {
  const context = use(PlayerContext);
  if (!context) {
    throw new Error("YouTubePlayer must be used inside PlayerProvider.");
  }
  return { register: context.register, setReady: context.setReady };
}

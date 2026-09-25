"use client";

import { ExternalLinkIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  loadIframeApi,
  type YouTubeApi,
  type YouTubePlayerInstance,
} from "@/lib/player/load-iframe-api";
import { usePlayerRegistration } from "@/lib/player/use-player";
import { buildThumbnailUrl, buildWatchUrl } from "@/lib/youtube/url";

// The no-cookie host doesn't set YouTube's tracking cookies until the video plays.
const EMBED_HOST = "https://www.youtube-nocookie.com";

/** How long the IFrame API gets to load before a plain embed is shown instead. */
const API_TIMEOUT_MS = 10_000;

type Mode =
  | { kind: "loading" }
  | { kind: "api" }
  // A plain embed, without the API. Seeking re-mounts it at the new start.
  | { kind: "fallback"; start: number; autoplay: boolean; key: number }
  | { kind: "error"; code: number };

/**
 * The embedded YouTube player. It registers with the PlayerProvider around
 * it, so other parts of the page can seek it. If the IFrame API doesn't load
 * in time, it shows a plain embed, which seeks by reloading.
 */
export function YouTubePlayer({
  youtubeId,
  title,
  startSeconds,
}: {
  youtubeId: string;
  title: string;
  /** Where the video starts, from the page's `?t=`. */
  startSeconds: number;
}) {
  const { register, setReady } = usePlayerRegistration();
  const [mode, setModeState] = useState<Mode>({ kind: "loading" });
  // The seek handle is handed to the provider once, so it reads these refs
  // rather than state.
  const modeRef = useRef<Mode>(mode);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const playerReadyRef = useRef(false);
  // A seek asked for before the player could take it.
  const pendingSeekRef = useRef<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const lastStartRef = useRef(startSeconds);

  function setMode(next: Mode) {
    modeRef.current = next;
    setModeState(next);
  }

  function seek(seconds: number) {
    const current = modeRef.current;
    const player = playerRef.current;
    switch (current.kind) {
      case "loading":
        pendingSeekRef.current = seconds;
        return;
      case "api":
        if (player && playerReadyRef.current) {
          player.seekTo(seconds, true);
          player.playVideo();
        } else {
          pendingSeekRef.current = seconds;
        }
        return;
      case "fallback":
        setMode({
          kind: "fallback",
          start: Math.floor(seconds),
          autoplay: true,
          key: current.key + 1,
        });
        return;
      case "error":
        return;
    }
  }

  useEffect(() => {
    register({ seekTo: seek });
    return () => register(null);
  });

  const createPlayer = useEffectEvent((api: YouTubeApi, element: HTMLElement) => {
    setMode({ kind: "api" });
    const player = new api.Player(element, {
      host: EMBED_HOST,
      videoId: youtubeId,
      width: "100%",
      height: "100%",
      playerVars: { start: startSeconds, rel: 0, playsinline: 1 },
      events: {
        onReady(event) {
          event.target.getIframe().title = title;
          playerReadyRef.current = true;
          setReady(true);
          const pending = pendingSeekRef.current;
          pendingSeekRef.current = null;
          if (pending !== null) {
            event.target.seekTo(pending, true);
            event.target.playVideo();
          }
        },
        onError(event) {
          playerReadyRef.current = false;
          setReady(false);
          setMode({ kind: "error", code: event.data });
        },
      },
    });
    playerRef.current = player;
    return player;
  });

  const showFallback = useEffectEvent(() => {
    // A timestamp clicked while the API was loading plays from there.
    const pending = pendingSeekRef.current;
    pendingSeekRef.current = null;
    setMode({
      kind: "fallback",
      start: Math.floor(pending ?? startSeconds),
      autoplay: pending !== null,
      key: 0,
    });
    setReady(true);
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // The API replaces this element with its iframe. React never renders into
    // the host, so it never trips over the swap.
    const element = document.createElement("div");
    host.append(element);

    let settled = false;
    let player: YouTubePlayerInstance | null = null;
    const timer = setTimeout(() => {
      settled = true;
      showFallback();
    }, API_TIMEOUT_MS);

    loadIframeApi().then(
      (api) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        player = createPlayer(api, element);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        showFallback();
      },
    );

    return () => {
      settled = true;
      clearTimeout(timer);
      player?.destroy();
      playerRef.current = null;
      playerReadyRef.current = false;
      setReady(false);
      host.replaceChildren();
    };
  }, [youtubeId, setReady]);

  // A link to this same video with a new `?t=` re-renders the page without
  // re-mounting the player, so seek to it.
  const seekToNewStart = useEffectEvent((seconds: number) => seek(seconds));
  useEffect(() => {
    if (startSeconds === lastStartRef.current) return;
    lastStartRef.current = startSeconds;
    seekToNewStart(startSeconds);
  }, [startSeconds]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={hostRef} className="absolute inset-0 [&_iframe]:size-full" />
      {mode.kind === "loading" && (
        // YouTube's own player shows this same image once it loads.
        <Image
          src={buildThumbnailUrl(youtubeId)}
          alt=""
          fill
          unoptimized
          preload
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />
      )}
      {mode.kind === "fallback" && (
        // A new key re-mounts the iframe: changing its src instead would add
        // a browser history entry for every seek.
        <iframe
          key={mode.key}
          src={fallbackEmbedUrl(youtubeId, mode.start, mode.autoplay)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          // YouTube refuses embeds that arrive without a referrer.
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      )}
      {mode.kind === "error" && <PlayerError code={mode.code} youtubeId={youtubeId} />}
    </div>
  );
}

function fallbackEmbedUrl(youtubeId: string, start: number, autoplay: boolean): string {
  const params = new URLSearchParams({ rel: "0", playsinline: "1" });
  if (start > 0) params.set("start", String(start));
  if (autoplay) params.set("autoplay", "1");
  return `${EMBED_HOST}/embed/${youtubeId}?${params}`;
}

/** What the player's error codes mean for the viewer. */
function playerErrorText(code: number): { title: string; detail: string } {
  switch (code) {
    // The owner turned off embedding.
    case 101:
    case 150:
      return {
        title: "This video can't be played here",
        detail: "Its owner doesn't allow playing it on other sites.",
      };
    case 100:
      return {
        title: "This video isn't available on YouTube anymore",
        detail: "It may have been removed or made private.",
      };
    default:
      return {
        title: "The player couldn't load this video",
        detail: "Try reloading the page, or watch it on YouTube.",
      };
  }
}

function PlayerError({ code, youtubeId }: { code: number; youtubeId: string }) {
  const { title, detail } = playerErrorText(code);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <a href={buildWatchUrl(youtubeId)} target="_blank" rel="noopener noreferrer">
          Open on YouTube
          <ExternalLinkIcon data-icon="inline-end" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}

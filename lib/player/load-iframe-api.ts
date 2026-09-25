// The YouTube IFrame Player API, loaded once per page and shared by every
// player on it. Only the parts the app uses are typed here.

const API_URL = "https://www.youtube.com/iframe_api";

export type YouTubePlayerInstance = {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
};

export type YouTubePlayerOptions = {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YouTubePlayerInstance }) => void;
    /** `data` is YouTube's error code: 2, 5, 100, 101, 150 and so on. */
    onError?: (event: { target: YouTubePlayerInstance; data: number }) => void;
  };
};

export type YouTubeApi = {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: Partial<YouTubeApi>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

/**
 * Loads the IFrame Player API, or returns the load already under way. If the
 * script fails, the next call tries again.
 */
export function loadIframeApi(): Promise<YouTubeApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube player only loads in the browser."));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT as YouTubeApi);

  apiPromise ??= new Promise<YouTubeApi>((resolve, reject) => {
    // The script calls this global when it's ready. Keep any handler already set.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YouTubeApi);
    };

    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      window.onYouTubeIframeAPIReady = previous;
      script.remove();
      reject(new Error("The YouTube player API didn't load."));
    };
    document.head.append(script);
  });
  return apiPromise;
}

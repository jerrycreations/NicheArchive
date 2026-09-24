const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Exact matches only, so look-alikes such as youtube.com.evil.com are rejected.
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const SHORT_LINK_HOST = "youtu.be";

// Paths shaped like /<prefix>/<id>.
const ID_PATH_PREFIXES = new Set(["shorts", "embed", "live"]);

export type YouTubeUrlFailure = "empty" | "not_youtube" | "no_video_id";

export type ParsedYouTubeUrl =
  | { ok: true; id: string }
  | { ok: false; reason: YouTubeUrlFailure };

/**
 * Extracts the video ID from any common YouTube link (watch, youtu.be, Shorts,
 * embed, live, mobile, music, no-cookie), with or without a protocol and
 * extra parameters, or from a bare 11-character ID.
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeUrl {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (VIDEO_ID.test(trimmed)) return { ok: true, id: trimmed };

  const url = toUrl(trimmed);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return { ok: false, reason: "not_youtube" };
  }

  const host = url.hostname.replace(/\.$/, "");
  const [first, second] = url.pathname.split("/").filter(Boolean);

  let id: string | null | undefined;
  if (host === SHORT_LINK_HOST) {
    id = first;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (first === "watch") id = url.searchParams.get("v");
    else if (ID_PATH_PREFIXES.has(first)) id = second;
  } else {
    return { ok: false, reason: "not_youtube" };
  }

  return id && VIDEO_ID.test(id)
    ? { ok: true, id }
    : { ok: false, reason: "no_video_id" };
}

function toUrl(input: string): URL | null {
  // Add a scheme only when there isn't one, so input like "javascript:…"
  // keeps its own and fails the protocol check.
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(input)
    ? input
    : `https://${input.replace(/^\/+/, "")}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function buildWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function buildThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The top bar's links, shared by the desktop links and the small-screen menu. */
export const NAV_ITEMS = [
  { href: "/library", label: "Library" },
  { href: "/chats", label: "Chats" },
] as const;

/**
 * Whether `href` is the current section: the page itself or any page below it,
 * so `/chats/<id>` keeps Chats highlighted. `/libraryx` doesn't match `/library`.
 */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The page for one saved video, e.g. `/videos/dQw4w9WgXcQ`. */
export function videoPath(youtubeId: string): string {
  return `/videos/${youtubeId}`;
}

// Seconds (`95`, `95s`) or YouTube's own form (`1h2m3s`, `1m30`).
const START_PARAM = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

/**
 * Where a video page's player starts, from its `?t=`. Anything unreadable, or
 * at or past the end of the video, starts from the beginning.
 */
export function parseStartParam(
  value: string | string[] | undefined,
  durationSeconds: number,
): number {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  const match = text ? START_PARAM.exec(text) : null;
  if (!match) return 0;
  const [hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const start = hours * 3600 + minutes * 60 + seconds;
  return start < durationSeconds ? start : 0;
}

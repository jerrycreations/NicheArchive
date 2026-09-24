// Links out of the app. The watch-page link is buildWatchUrl in
// lib/youtube/url.ts.

/**
 * youtubetotranscript.com, where the user can copy a transcript by hand when
 * the automatic sources fail. The app only links there and never requests
 * anything from the site. This is its home page, where the user pastes the
 * video's link. Once its URL for a single video is confirmed, link straight
 * to that page instead.
 */
export const TRANSCRIPT_SITE_URL = "https://youtubetotranscript.com/";

export const TRANSCRIPT_SITE_NAME = "youtubetotranscript.com";

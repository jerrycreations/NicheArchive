import "server-only";
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type FetchParams,
} from "youtube-transcript-plus";
import type { TranscriptSegment, TranscriptSource } from "@/lib/transcript/types";
import { normalizeCaptionCues } from "./caption-normalize";

// The only file that uses the caption library, so replacing it touches nothing
// else. Callers must run on the Node.js runtime (`runtime = "nodejs"`).

const TIMEOUT_MS = 20_000;

const ENGLISH = /^en(?:-|$)/i;

/** The part of a caption track in YouTube's player response that we read. */
export type CaptionTrack = {
  languageCode: string;
  /** "asr" for auto-generated tracks; absent for tracks the uploader wrote. */
  kind?: string;
};

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  captions?: { playerCaptionsTracklistRenderer?: Tracklist };
  playerCaptionsTracklistRenderer?: Tracklist;
};

type Tracklist = { captionTracks?: CaptionTrack[] };

export type CaptionSource = Extract<
  TranscriptSource,
  "manual_captions" | "auto_captions"
>;

export type CaptionFailureReason =
  | "no_english_track"
  | "empty"
  | "unavailable"
  | "error";

export type CaptionResult =
  | { ok: true; source: CaptionSource; segments: TranscriptSegment[] }
  | { ok: false; reason: CaptionFailureReason; detail: string };

/**
 * The first English track the uploader wrote (any variant, such as en-GB),
 * else the first auto-generated English track. The list holds only tracks
 * published for the video; auto-translations aren't in it, so they're never
 * chosen.
 */
export function pickEnglishTrack<T extends CaptionTrack>(
  tracks: readonly T[],
): T | null {
  const english = tracks.filter((track) => ENGLISH.test(track.languageCode));
  return english.find((track) => track.kind !== "asr") ?? english[0] ?? null;
}

/** What the player request saw, used to explain failures. */
type PlayerProbe = {
  called: boolean;
  httpStatus?: number;
  playability?: PlayerResponse["playabilityStatus"];
  languages: string[];
  chosen: CaptionTrack | null;
};

/**
 * Reads the video's published English captions. Never throws; failures come
 * back with a reason and a plain-English detail.
 */
export async function fetchCaptions(youtubeId: string): Promise<CaptionResult> {
  const probe: PlayerProbe = { called: false, languages: [], chosen: null };

  let cues;
  try {
    cues = await fetchTranscript(youtubeId, {
      playerFetch: (params) => fetchPlayerWithChosenTrack(params, probe),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, ...describeFailure(error, probe) };
  }

  const segments = normalizeCaptionCues(cues, { unit: "seconds" });
  if (segments.length === 0) {
    return { ok: false, reason: "empty", detail: "The caption track had no text." };
  }
  return {
    ok: true,
    source: probe.chosen?.kind === "asr" ? "auto_captions" : "manual_captions",
    segments,
  };
}

/**
 * The library picks a track by language code alone, but a video's manual and
 * auto-generated English tracks share the code "en". So this sends the
 * library's player request itself, picks the track, and hands back a response
 * listing only that track, which the library then uses.
 */
async function fetchPlayerWithChosenTrack(
  { url, method, body, headers, userAgent, signal }: FetchParams,
  probe: PlayerProbe,
): Promise<Response> {
  probe.called = true;
  const response = await fetch(url, {
    method,
    body,
    headers: { ...(userAgent && { "User-Agent": userAgent }), ...headers },
    signal,
  });
  probe.httpStatus = response.status;
  if (!response.ok) return response;

  const player = (await response.json()) as PlayerResponse;
  probe.playability = player.playabilityStatus;

  const tracklist =
    player.captions?.playerCaptionsTracklistRenderer ??
    player.playerCaptionsTracklistRenderer;
  if (tracklist?.captionTracks) {
    probe.languages = tracklist.captionTracks.map((track) => track.languageCode);
    probe.chosen = pickEnglishTrack(tracklist.captionTracks);
    tracklist.captionTracks = probe.chosen ? [probe.chosen] : [];
  }

  return Response.json(player, { status: response.status });
}

function describeFailure(
  error: unknown,
  probe: PlayerProbe,
): { reason: CaptionFailureReason; detail: string } {
  if (probe.languages.length > 0 && !probe.chosen) {
    return {
      reason: "no_english_track",
      detail: `No English captions. Available: ${probe.languages.join(", ")}.`,
    };
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return {
      reason: "error",
      detail: `YouTube didn't respond within ${TIMEOUT_MS / 1000} seconds.`,
    };
  }

  // A bot check shows up here, e.g. LOGIN_REQUIRED: "Sign in to confirm you're not a bot".
  const status = probe.playability?.status;
  if (status && status !== "OK") {
    const reason = probe.playability?.reason;
    return {
      reason: "unavailable",
      detail: `YouTube said ${status}${reason ? `: ${reason}` : ""}.`,
    };
  }

  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    return {
      reason: "unavailable",
      detail: "YouTube is rate-limiting requests from this server.",
    };
  }
  if (error instanceof YoutubeTranscriptVideoUnavailableError) {
    return {
      reason: "unavailable",
      detail: probe.called
        ? `YouTube's player API refused the request (HTTP ${probe.httpStatus}).`
        : "YouTube's watch page didn't load.",
    };
  }
  if (error instanceof YoutubeTranscriptDisabledError) {
    return { reason: "no_english_track", detail: "This video has no captions." };
  }
  if (error instanceof YoutubeTranscriptNotAvailableError) {
    if (probe.chosen) {
      return {
        reason: "empty",
        detail: "YouTube returned an empty caption file or refused to send it.",
      };
    }
    if (!probe.called) {
      return {
        reason: "unavailable",
        detail:
          "YouTube's watch page had no player API key, which usually means a bot check.",
      };
    }
  }

  return {
    reason: "error",
    detail: error instanceof Error ? error.message : String(error),
  };
}

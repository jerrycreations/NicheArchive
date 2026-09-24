// Browser helpers for the transcript routes. They never throw: a failed
// request comes back as null, and callers decide what to tell the user.
import type {
  ProcessOutcome,
  ProcessResponse,
  TranscriptStatusInfo,
} from "@/lib/transcript/status";

/**
 * Asks the server to get a video's transcript, or to try again after a
 * failure. Safe to call more than once: only one run works on a video.
 */
export async function requestTranscript(youtubeId: string): Promise<ProcessOutcome | null> {
  try {
    const response = await fetch("/api/transcripts/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeId }),
    });
    const body = (await response.json()) as Partial<ProcessResponse>;
    return body.outcome ?? null;
  } catch {
    return null;
  }
}

/** The current transcript states of these videos. Videos that no longer exist are left out. */
export async function fetchTranscriptStatuses(
  youtubeIds: readonly string[],
): Promise<TranscriptStatusInfo[] | null> {
  try {
    const query = new URLSearchParams({ ids: youtubeIds.join(",") });
    const response = await fetch(`/api/videos/status?${query}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as TranscriptStatusInfo[]) : null;
  } catch {
    return null;
  }
}

// Browser helpers for the search index routes. They never throw: a failed
// request comes back as null or a message, and callers decide what to tell
// the user.
import { SERVER_UNREACHABLE } from "@/lib/errors";
import type { IndexPendingResponse, IndexResponse } from "@/lib/search/index-types";

/** Waited after a 429 when Google doesn't say how long. */
const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 60;

/** A video still rate-limited after this many waits is counted as failed, and the run moves on. */
const MAX_WAITS_PER_VIDEO = 5;

/** Builds one video's search index and waits for it to finish. */
export async function requestIndex(youtubeId: string): Promise<IndexResponse | null> {
  try {
    const response = await fetch(`/api/index/${encodeURIComponent(youtubeId)}`, { method: "POST" });
    const body = (await response.json()) as Partial<IndexResponse>;
    return typeof body.outcome === "string" ? (body as IndexResponse) : null;
  } catch {
    return null;
  }
}

/**
 * The ready videos to index: those never indexed, indexed with another
 * embedding model or whose last try failed, or with `all`, every one.
 */
export async function fetchIndexCandidates(
  all: boolean,
): Promise<{ ok: true; youtubeIds: string[] } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/index/pending?all=${all ? 1 : 0}`, { cache: "no-store" });
    const body = (await response.json()) as IndexPendingResponse;
    return "youtubeIds" in body ? { ok: true, youtubeIds: body.youtubeIds } : { ok: false, message: body.error };
  } catch {
    return { ok: false, message: SERVER_UNREACHABLE };
  }
}

export type ReindexProgress = {
  /** Videos finished, whether indexed, skipped or failed. */
  done: number;
  total: number;
  failed: number;
  /** Set while waiting out a rate limit: seconds left before the run goes on. */
  waitingSeconds?: number;
};

export type ReindexSummary = ReindexProgress & {
  /** Why the run stopped early, when every later video would fail the same way. */
  stoppedBecause?: string;
  cancelled: boolean;
};

type ReindexOptions = {
  signal: AbortSignal;
  onProgress: (progress: ReindexProgress) => void;
  /** For tests. */
  request?: typeof requestIndex;
  /** For tests: waits one second, or less when the run is cancelled. */
  tick?: (signal: AbortSignal) => Promise<void>;
};

/**
 * Indexes videos one at a time, the pace Gemini's free embedding limits
 * allow. After a 429 it counts down Google's suggested wait, or a minute,
 * and tries the same video again. A used-up daily quota or broken settings
 * stop the run, since every later video would fail the same way. Each video
 * records the model it was indexed with, so a cancelled run is picked up by
 * the next one.
 */
export async function runReindex(
  youtubeIds: readonly string[],
  { signal, onProgress, request = requestIndex, tick = oneSecond }: ReindexOptions,
): Promise<ReindexSummary> {
  const progress: ReindexProgress = { done: 0, total: youtubeIds.length, failed: 0 };
  const summary = (extra: Partial<ReindexSummary> = {}): ReindexSummary => ({
    ...progress,
    cancelled: signal.aborted,
    ...extra,
  });
  onProgress({ ...progress });

  for (const youtubeId of youtubeIds) {
    let waits = 0;
    for (;;) {
      if (signal.aborted) return summary();
      const response = await request(youtubeId);

      if (response?.outcome === "failed" && response.reason === "rate_limited") {
        if (response.daily) return summary({ stoppedBecause: response.message });
        if (waits < MAX_WAITS_PER_VIDEO) {
          waits += 1;
          const seconds = response.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS;
          for (let left = seconds; left > 0; left--) {
            if (signal.aborted) return summary();
            onProgress({ ...progress, waitingSeconds: left });
            await tick(signal);
          }
          continue;
        }
      }
      if (response?.outcome === "failed" && stopsRun(response.reason)) {
        progress.failed += 1;
        progress.done += 1;
        return summary({ stoppedBecause: response.message });
      }
      if (response === null || response.outcome === "failed") progress.failed += 1;
      break;
    }
    progress.done += 1;
    onProgress({ ...progress });
  }
  return summary();
}

/** Failures that every later video would hit too. */
function stopsRun(reason: string): boolean {
  return reason === "config" || reason === "bad_key" || reason === "model_not_found";
}

function oneSecond(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 1_000);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}

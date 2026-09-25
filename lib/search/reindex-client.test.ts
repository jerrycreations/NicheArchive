import { describe, expect, it, vi } from "vitest";
import type { IndexResponse } from "./index-types";
import { runReindex, type ReindexProgress } from "./reindex-client";

const indexed: IndexResponse = { outcome: "indexed", chunkCount: 3 };
const LIMIT_MESSAGE = "Gemini's free limit was reached. Try again in a minute.";
const rateLimited = (extra: { retryAfterSeconds?: number; daily?: boolean } = {}): IndexResponse => ({
  outcome: "failed",
  reason: "rate_limited",
  message: LIMIT_MESSAGE,
  ...extra,
});

/** Answers each call with the next response for that video, then `indexed`. */
function server(responses: Record<string, (IndexResponse | null)[]> = {}) {
  return vi.fn(async (youtubeId: string) => {
    const queue = responses[youtubeId];
    return queue && queue.length > 0 ? queue.shift()! : indexed;
  });
}

function run(
  ids: string[],
  request: ReturnType<typeof server>,
  { controller = new AbortController(), onTick = () => {} } = {},
) {
  const progress: ReindexProgress[] = [];
  const tick = vi.fn(async () => onTick());
  const summary = runReindex(ids, {
    signal: controller.signal,
    onProgress: (update) => progress.push(update),
    request,
    tick,
  });
  return { summary, progress, tick };
}

describe("runReindex", () => {
  it("indexes the videos one at a time and reports progress", async () => {
    const request = server();
    const { summary, progress } = run(["a", "b", "c"], request);

    expect(await summary).toEqual({ done: 3, total: 3, failed: 0, cancelled: false });
    expect(request.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    expect(progress.map((update) => update.done)).toEqual([0, 1, 2, 3]);
  });

  it("counts down Google's wait after a 429, then tries the same video again", async () => {
    const request = server({ b: [rateLimited({ retryAfterSeconds: 3 })] });
    const { summary, progress, tick } = run(["a", "b", "c"], request);

    expect(await summary).toMatchObject({ done: 3, failed: 0 });
    expect(request.mock.calls.map(([id]) => id)).toEqual(["a", "b", "b", "c"]);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(progress.flatMap((update) => update.waitingSeconds ?? [])).toEqual([3, 2, 1]);
  });

  it("waits a minute when a 429 doesn't say how long", async () => {
    const request = server({ a: [rateLimited()] });
    const { summary, tick } = run(["a"], request);

    await summary;
    expect(tick).toHaveBeenCalledTimes(60);
  });

  it("moves on after waiting five times for the same video", async () => {
    const request = server({ a: Array.from({ length: 6 }, () => rateLimited({ retryAfterSeconds: 1 })) });
    const { summary } = run(["a", "b"], request);

    expect(await summary).toMatchObject({ done: 2, failed: 1 });
    expect(request).toHaveBeenCalledTimes(7);
  });

  it("stops when the daily quota is used up", async () => {
    const request = server({ b: [rateLimited({ daily: true, retryAfterSeconds: 30 })] });
    const { summary } = run(["a", "b", "c"], request);

    expect(await summary).toEqual({
      done: 1,
      total: 3,
      failed: 0,
      cancelled: false,
      stoppedBecause: LIMIT_MESSAGE,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stops when the settings are broken, since every video would fail", async () => {
    const request = server({
      a: [{ outcome: "failed", reason: "config", message: "Check EMBEDDING_DIMENSIONS." }],
    });
    const { summary } = run(["a", "b"], request);

    expect(await summary).toMatchObject({ done: 1, failed: 1, stoppedBecause: "Check EMBEDDING_DIMENSIONS." });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("counts other failures and unreachable requests, and carries on", async () => {
    const request = server({
      a: [{ outcome: "failed", reason: "timeout", message: "Indexing took too long. Try again." }],
      b: [null],
    });
    const { summary } = run(["a", "b", "c"], request);

    expect(await summary).toEqual({ done: 3, total: 3, failed: 2, cancelled: false });
  });

  it("counts videos that are gone or not ready as done, not failed", async () => {
    const request = server({ a: [{ outcome: "not_found" }], b: [{ outcome: "not_ready" }] });
    expect(await run(["a", "b"], request).summary).toMatchObject({ done: 2, failed: 0 });
  });

  it("stops at once when cancelled during a wait", async () => {
    const controller = new AbortController();
    const request = server({ b: [rateLimited({ retryAfterSeconds: 30 })] });
    let ticks = 0;
    const { summary } = run(["a", "b", "c"], request, {
      controller,
      onTick: () => {
        if (++ticks === 2) controller.abort();
      },
    });

    expect(await summary).toEqual({ done: 1, total: 3, failed: 0, cancelled: true });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stops before the next video when cancelled", async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => {
      controller.abort();
      return indexed;
    });
    const summary = await runReindex(["a", "b"], {
      signal: controller.signal,
      onProgress: () => {},
      request,
    });

    expect(summary).toEqual({ done: 1, total: 2, failed: 0, cancelled: true });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

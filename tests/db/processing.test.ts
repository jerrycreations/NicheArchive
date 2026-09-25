import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { STALE_PROCESSING_MINUTES } from "@/lib/constants";
import {
  claimForProcessing,
  getVideoById,
  markTranscriptFailed,
  writeTranscript,
  type TranscriptValues,
} from "@/lib/db/queries/videos";
import { videos } from "@/lib/db/schema";
import { createTestDb, insertTestVideo, type TestDb } from "./setup";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/db", () => ({ db: () => testDb.current }));

let test: TestDb;

beforeAll(async () => {
  test = await createTestDb();
  testDb.current = test.db;
});

afterAll(async () => {
  await test.client.close();
});

const START = new Date("2026-09-25T12:00:00.123Z");
const minutesLater = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

const TRANSCRIPT: TranscriptValues = {
  segments: [{ start: 0, duration: 2, text: "Hello." }],
  text: "Hello.",
  source: "manual_captions",
  timestampsEstimated: false,
};

describe("claimForProcessing", () => {
  it("claims a pending video once", async () => {
    const { id } = await insertTestVideo(test.raw);
    expect(await claimForProcessing(id, START)).toEqual(START);
    // A second tab, a minute later, finds it taken.
    expect(await claimForProcessing(id, minutesLater(1))).toBeNull();
  });

  it("claims it again once the claim has stalled", async () => {
    const { id } = await insertTestVideo(test.raw);
    await claimForProcessing(id, START);
    expect(await claimForProcessing(id, minutesLater(STALE_PROCESSING_MINUTES - 1))).toBeNull();
    const retry = minutesLater(STALE_PROCESSING_MINUTES + 1);
    expect(await claimForProcessing(id, retry)).toEqual(retry);
  });

  it("claims a failed video and clears its error", async () => {
    const { id } = await insertTestVideo(test.raw, { status: "failed", errorMessage: "Nope." });
    expect(await claimForProcessing(id, START)).toEqual(START);
    const video = await getVideoById(id);
    expect(video).toMatchObject({ status: "pending", errorMessage: null });
  });

  it("never claims a ready video", async () => {
    const { id } = await insertTestVideo(test.raw, { status: "ready" });
    expect(await claimForProcessing(id, START)).toBeNull();
  });

  it("claims nothing for a video that's gone", async () => {
    expect(await claimForProcessing(crypto.randomUUID(), START)).toBeNull();
  });
});

describe("writes fenced by the claim", () => {
  it("saves the transcript while the claim is still the run's", async () => {
    const { id } = await insertTestVideo(test.raw);
    const claimedAt = await claimForProcessing(id, START);
    expect(await writeTranscript(id, TRANSCRIPT, { claimedAt: claimedAt! })).toBe(true);
    expect(await getVideoById(id)).toMatchObject({
      status: "ready",
      transcriptText: "Hello.",
      transcriptSource: "manual_captions",
      processingStartedAt: null,
    });
  });

  it("ignores a stalled run's transcript once a retry has taken over", async () => {
    const { id } = await insertTestVideo(test.raw);
    const stalled = await claimForProcessing(id, START);
    const retry = await claimForProcessing(id, minutesLater(STALE_PROCESSING_MINUTES + 1));

    expect(await writeTranscript(id, TRANSCRIPT, { claimedAt: stalled! })).toBe(false);
    expect(await markTranscriptFailed(id, stalled!, "Too late.")).toBe(false);
    const video = await getVideoById(id);
    expect(video).toMatchObject({ status: "pending", processingStartedAt: retry });
  });

  it("ignores a run's failure once a paste has saved a transcript", async () => {
    const { id } = await insertTestVideo(test.raw);
    const claimedAt = await claimForProcessing(id, START);
    // A paste passes no claim, so it always lands and clears the run's.
    expect(await writeTranscript(id, { ...TRANSCRIPT, source: "pasted" })).toBe(true);

    expect(await markTranscriptFailed(id, claimedAt!, "Captions: none.")).toBe(false);
    expect(await writeTranscript(id, TRANSCRIPT, { claimedAt: claimedAt! })).toBe(false);
    expect(await getVideoById(id)).toMatchObject({ status: "ready", transcriptSource: "pasted" });
  });

  it("marks the video failed while the claim is still the run's", async () => {
    const { id } = await insertTestVideo(test.raw);
    const claimedAt = await claimForProcessing(id, START);
    expect(await markTranscriptFailed(id, claimedAt!, "Captions: none.")).toBe(true);
    const [row] = await test.raw
      .select({ status: videos.status, error: videos.errorMessage, claim: videos.processingStartedAt })
      .from(videos)
      .where(eq(videos.id, id));
    expect(row).toEqual({ status: "failed", error: "Captions: none.", claim: null });
  });

  it("clears the search index state when a transcript is replaced", async () => {
    const { id } = await insertTestVideo(test.raw, {
      status: "ready",
      indexedAt: START,
      indexedModel: "gemini-embedding-2",
      indexError: "Old failure.",
    });
    await writeTranscript(id, { ...TRANSCRIPT, source: "pasted" });
    expect(await getVideoById(id)).toMatchObject({
      indexedAt: null,
      indexedModel: null,
      indexError: null,
    });
  });
});

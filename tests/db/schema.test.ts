import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chats, messages, transcriptChunks, videos } from "@/lib/db/schema";
import { createTestDb, embedding, insertTestVideo, type TestDb } from "./setup";

let test: TestDb;

beforeAll(async () => {
  test = await createTestDb();
});

afterAll(async () => {
  await test.client.close();
});

/** Whether a row's search_vector matches `words`, as the library search box asks. */
async function videoMatches(id: string, words: string): Promise<boolean> {
  const [row] = await test.raw
    .select({ hit: sql<boolean>`${videos.searchVector} @@ websearch_to_tsquery('english', ${words})` })
    .from(videos)
    .where(eq(videos.id, id));
  return row.hit;
}

describe("generated search columns", () => {
  it("index a video's title, channel and transcript", async () => {
    const { id } = await insertTestVideo(test.raw, {
      title: "How Bread Rises",
      channel: "The Kitchen Lab",
      transcriptText: "Yeast ferments the sugars in the dough.",
    });
    expect(await videoMatches(id, "bread")).toBe(true);
    expect(await videoMatches(id, "kitchen")).toBe(true);
    // Stemmed, so "fermenting" finds "ferments".
    expect(await videoMatches(id, "fermenting")).toBe(true);
    expect(await videoMatches(id, "elephant")).toBe(false);
  });

  it("weight the title above the transcript", async () => {
    const { id } = await insertTestVideo(test.raw, {
      title: "Sourdough",
      transcriptText: "Rye flour.",
    });
    const [row] = await test.raw
      .select({ vector: sql<string>`${videos.searchVector}::text` })
      .from(videos)
      .where(eq(videos.id, id));
    expect(row.vector).toContain("'sourdough':1A");
    expect(row.vector).toMatch(/'rye':\d+C?/);
  });

  it("index a transcript chunk's text", async () => {
    const { id: videoId } = await insertTestVideo(test.raw);
    const [chunk] = await test.raw
      .insert(transcriptChunks)
      .values({
        videoId,
        position: 0,
        startSeconds: 0,
        endSeconds: 30,
        text: "The elephants have really long trunks.",
        embedding: embedding({ 0: 1 }),
      })
      .returning({ id: transcriptChunks.id });
    const [row] = await test.raw
      .select({ hit: sql<boolean>`${transcriptChunks.searchVector} @@ websearch_to_tsquery('english', 'trunk')` })
      .from(transcriptChunks)
      .where(eq(transcriptChunks.id, chunk.id));
    expect(row.hit).toBe(true);
  });
});

describe("deleting a video", () => {
  it("removes its chunks, its chats and their messages", async () => {
    const { id: videoId } = await insertTestVideo(test.raw);
    await test.raw.insert(transcriptChunks).values({
      videoId,
      position: 0,
      startSeconds: 0,
      endSeconds: 30,
      text: "Hello.",
      embedding: embedding({ 1: 1 }),
    });
    const chatId = crypto.randomUUID();
    await test.raw.insert(chats).values({ id: chatId, mode: "video", videoId, owner: "Alex" });
    await test.raw.insert(messages).values([
      { chatId, role: "user", content: "What's this about?" },
      { chatId, role: "assistant", content: "Hello." },
    ]);

    await test.raw.delete(videos).where(eq(videos.id, videoId));

    expect(await test.raw.$count(transcriptChunks, eq(transcriptChunks.videoId, videoId))).toBe(0);
    expect(await test.raw.$count(chats, eq(chats.id, chatId))).toBe(0);
    expect(await test.raw.$count(messages, eq(messages.chatId, chatId))).toBe(0);
  });

  it("leaves other videos' rows alone", async () => {
    const kept = await insertTestVideo(test.raw);
    const gone = await insertTestVideo(test.raw);
    const chatId = crypto.randomUUID();
    await test.raw.insert(chats).values({ id: chatId, mode: "video", videoId: kept.id, owner: "Alex" });

    await test.raw.delete(videos).where(eq(videos.id, gone.id));

    expect(await test.raw.$count(chats, eq(chats.id, chatId))).toBe(1);
  });
});

describe("the chat mode check", () => {
  /** The database's own message, under Drizzle's "Failed query" wrapper. */
  async function failure(query: Promise<unknown>): Promise<string> {
    const error = await query.then(
      () => null,
      (reason: unknown) => reason,
    );
    return error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  }

  it("rejects a video chat without a video", async () => {
    const message = await failure(
      test.raw.insert(chats).values({ id: crypto.randomUUID(), mode: "video", videoId: null, owner: "Alex" }),
    );
    expect(message).toContain("chats_video_id_matches_mode");
  });

  it("rejects a library chat tied to a video", async () => {
    const { id: videoId } = await insertTestVideo(test.raw);
    const message = await failure(
      test.raw.insert(chats).values({ id: crypto.randomUUID(), mode: "library", videoId, owner: "Alex" }),
    );
    expect(message).toContain("chats_video_id_matches_mode");
  });

  it("accepts library and general chats without a video", async () => {
    await test.raw.insert(chats).values([
      { id: crypto.randomUUID(), mode: "library", videoId: null, owner: "Alex" },
      { id: crypto.randomUUID(), mode: "general", videoId: null, owner: "Alex" },
    ]);
  });
});

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { embedQuery } from "@/lib/ai/embed";
import { transcriptChunks } from "@/lib/db/schema";
import { hybridSearch } from "@/lib/search/hybrid";
import { createTestDb, embedding, insertTestVideo, type TestDb } from "./setup";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/db", () => ({ db: () => testDb.current }));
vi.mock("@/lib/ai/embed", () => ({ embedQuery: vi.fn() }));

// The question points mostly along axis 1 and a little along axis 3.
const QUESTION = embedding({ 1: 1, 3: 0.5 });

let test: TestDb;
let videoId: string;
const chunkIds: Record<string, string> = {};

/**
 * Four chunks with hand-made meanings:
 * - sourdough: axis 0, unrelated to the question's meaning
 * - elephants: axis 1, the closest in meaning (about 0.89)
 * - zebras: axis 3, a looser match (about 0.45)
 * - bread: axis 2, unrelated
 * and two fillers a little closer than the unrelated ones (about 0.18), so
 * the meaning list's order has no ties.
 */
const CHUNKS: { key: string; text: string; vector: Record<number, number> }[] = [
  { key: "sourdough", text: "A sourdough starter needs flour and water.", vector: { 0: 1 } },
  { key: "elephants", text: "The elephants have really long trunks.", vector: { 1: 1 } },
  { key: "zebras", text: "Zebras have black and white stripes.", vector: { 3: 1 } },
  { key: "bread", text: "Baking a loaf at home.", vector: { 2: 1 } },
  { key: "filler1", text: "Some unrelated words.", vector: { 4: 1, 1: 0.2 } },
  { key: "filler2", text: "More unrelated words.", vector: { 5: 1, 1: 0.2 } },
];

beforeAll(async () => {
  test = await createTestDb();
  testDb.current = test.db;
  ({ id: videoId } = await insertTestVideo(test.raw));
  for (const [position, chunk] of CHUNKS.entries()) {
    const [row] = await test.raw
      .insert(transcriptChunks)
      .values({
        videoId,
        position,
        startSeconds: position * 60,
        endSeconds: position * 60 + 60,
        text: chunk.text,
        embedding: embedding(chunk.vector),
      })
      .returning({ id: transcriptChunks.id });
    chunkIds[chunk.key] = row.id;
  }
});

afterAll(async () => {
  await test.client.close();
});

beforeEach(() => {
  vi.mocked(embedQuery).mockResolvedValue(QUESTION);
});

type Row = { chunk_id: string; similarity: number | null; keyword_rank: number | null };

/** hybrid_search itself, with a small match_count so each list keeps only 4 chunks. */
async function search(text: string, matchCount: number): Promise<Row[]> {
  const vector = `[${QUESTION.join(",")}]`;
  const result = await test.raw.execute<Row>(
    sql`select chunk_id, similarity, keyword_rank from hybrid_search(${text}, ${vector}::extensions.vector, ${matchCount})`,
  );
  return result.rows;
}

describe("hybrid_search", () => {
  it("returns keyword-only matches with no similarity, and meaning-only ones with no keyword rank", async () => {
    // "sourdough" is only a keyword match; its meaning is too far off to make
    // the meaning list. The elephants chunk is only a meaning match.
    const rows = await search("sourdough", 2);
    expect(rows.map((row) => row.chunk_id)).toEqual([chunkIds.elephants, chunkIds.sourdough]);
    const [elephants, sourdough] = rows;
    expect(elephants.similarity).toBeCloseTo(0.894, 3);
    expect(elephants.keyword_rank).toBeNull();
    expect(sourdough.similarity).toBeNull();
    expect(sourdough.keyword_rank).toBeGreaterThan(0);
  });

  it("puts a chunk that matches both ways first", async () => {
    const rows = await search("trunks", 2);
    expect(rows.map((row) => row.chunk_id)).toEqual([chunkIds.elephants, chunkIds.zebras]);
    expect(rows[0].similarity).toBeCloseTo(0.894, 3);
    expect(rows[0].keyword_rank).toBeGreaterThan(0);
    expect(rows[1].keyword_rank).toBeNull();
  });

  it("still ranks by meaning when no words match", async () => {
    const rows = await search("giraffes", 3);
    expect(rows.map((row) => row.chunk_id)).toEqual([
      chunkIds.elephants,
      chunkIds.zebras,
      expect.any(String),
    ]);
    expect(rows.every((row) => row.keyword_rank === null)).toBe(true);
  });
});

describe("hybridSearch", () => {
  it("embeds the question and maps the rows to matches", async () => {
    const matches = await hybridSearch("trunks");
    expect(embedQuery).toHaveBeenCalledWith("trunks", { abortSignal: undefined });

    const [best] = matches;
    expect(best).toEqual({
      chunkId: chunkIds.elephants,
      videoId,
      position: 1,
      startSeconds: 60,
      endSeconds: 120,
      text: "The elephants have really long trunks.",
      similarity: expect.closeTo(0.894, 3),
      keywordRank: expect.any(Number),
      score: expect.any(Number),
    });
    // With few chunks, every one is a meaning match.
    expect(matches).toHaveLength(CHUNKS.length);
    expect(matches.map((match) => match.score)).toEqual(
      [...matches.map((match) => match.score)].sort((a, b) => b - a),
    );
  });
});

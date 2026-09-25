import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  countNotReady,
  countVideos,
  listExportVideos,
  listVideos,
} from "@/lib/db/queries/videos";
import { createTestDb, insertTestVideo, type TestDb } from "./setup";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/db", () => ({ db: () => testDb.current }));

let test: TestDb;

const SEGMENTS = [{ start: 0, duration: 2, text: "Hello." }];

// Inserted in this order, so each is "added" after the one before.
const LIBRARY = [
  {
    key: "zoo",
    title: "Me at the zoo",
    channel: "jawed",
    transcriptText: "The elephants have really long trunks.",
    publishedAt: new Date("2005-04-24T00:00:00Z"),
  },
  {
    key: "bread",
    title: "How Bread Rises",
    channel: "The Kitchen Lab",
    transcriptText: "Yeast ferments the sugars.",
    publishedAt: new Date("2025-03-14T00:00:00Z"),
  },
  {
    key: "rye",
    title: "100% Rye Loaf",
    channel: "bread_lab",
    transcriptText: "Rye has little gluten, so this bread is dense.",
    publishedAt: new Date("2024-01-01T00:00:00Z"),
  },
  {
    key: "pending",
    title: "Knots for camping",
    channel: "Knotsman",
    transcriptText: null,
    publishedAt: new Date("2023-06-01T00:00:00Z"),
  },
] as const;

const ids: Record<string, string> = {};

beforeAll(async () => {
  test = await createTestDb();
  testDb.current = test.db;
  for (const video of LIBRARY) {
    const ready = video.transcriptText !== null;
    const { id } = await insertTestVideo(test.raw, {
      title: video.title,
      channel: video.channel,
      publishedAt: video.publishedAt,
      transcriptText: video.transcriptText,
      transcriptSegments: ready ? SEGMENTS : null,
      status: ready ? "ready" : "pending",
    });
    ids[video.key] = id;
  }
});

afterAll(async () => {
  await test.client.close();
});

const titlesFor = async (options: Parameters<typeof listVideos>[0]) =>
  (await listVideos(options)).map((video) => video.title);

describe("listVideos", () => {
  it("lists newest added first by default", async () => {
    expect(await titlesFor({})).toEqual([
      "Knots for camping",
      "100% Rye Loaf",
      "How Bread Rises",
      "Me at the zoo",
    ]);
  });

  it("lists newest published first", async () => {
    expect(await titlesFor({ sort: "published" })).toEqual([
      "How Bread Rises",
      "100% Rye Loaf",
      "Knots for camping",
      "Me at the zoo",
    ]);
  });

  it("finds words in the transcript, stemmed", async () => {
    expect(await titlesFor({ q: "elephant" })).toEqual(["Me at the zoo"]);
  });

  it("finds part of a title or channel", async () => {
    expect(await titlesFor({ q: "zo" })).toEqual(["Me at the zoo"]);
    expect(await titlesFor({ q: "knots" })).toEqual(["Knots for camping"]);
    expect(await titlesFor({ q: "kitchen l" })).toEqual(["How Bread Rises"]);
  });

  it("takes % and _ literally", async () => {
    expect(await titlesFor({ q: "%" })).toEqual(["100% Rye Loaf"]);
    expect(await titlesFor({ q: "_" })).toEqual(["100% Rye Loaf"]);
  });

  it("puts better word matches first, then the chosen order", async () => {
    // "bread" is in one title and in the other's channel and transcript. The
    // rye loaf was added later, but the title match ranks higher.
    expect(await titlesFor({ q: "bread" })).toEqual(["How Bread Rises", "100% Rye Loaf"]);
  });

  it("matches nothing for unrelated words", async () => {
    expect(await titlesFor({ q: "giraffe" })).toEqual([]);
  });

  it("carries each video's effective status and chat count", async () => {
    const [knots] = await listVideos({ q: "knots" });
    expect(knots).toMatchObject({ status: "pending", chatCount: 0, youtubeId: expect.any(String) });
  });
});

describe("countVideos", () => {
  it("counts the whole library", async () => {
    expect(await countVideos()).toBe(LIBRARY.length);
  });
});

describe("listExportVideos and countNotReady", () => {
  it("lists ready videos by title, with their transcripts", async () => {
    const exported = await listExportVideos();
    expect(exported.map((video) => video.title)).toEqual([
      "100% Rye Loaf",
      "How Bread Rises",
      "Me at the zoo",
    ]);
    expect(exported[0]).toMatchObject({
      channel: "bread_lab",
      publishedAt: new Date("2024-01-01T00:00:00Z"),
      transcriptSegments: SEGMENTS,
    });
  });

  it("counts the videos it leaves out", async () => {
    expect(await countNotReady()).toBe(1);
  });
});

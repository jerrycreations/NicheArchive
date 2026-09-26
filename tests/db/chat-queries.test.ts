import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatConflictError,
  createChatIfMissing,
  deleteChatById,
  getChat,
  listChats,
  listChatsForVideo,
  updateChatTitle,
} from "@/lib/db/queries/chats";
import { saveExchange } from "@/lib/db/queries/messages";
import { chats } from "@/lib/db/schema";
import { createTestDb, insertTestVideo, type TestDb } from "./setup";

const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/db", () => ({ db: () => testDb.current }));

let test: TestDb;
let videoId: string;

beforeAll(async () => {
  test = await createTestDb();
  testDb.current = test.db;
  ({ id: videoId } = await insertTestVideo(test.raw));
});

afterAll(async () => {
  await test.client.close();
});

beforeEach(async () => {
  await test.raw.delete(chats);
});

/** A chat of `owner`'s, `minutesAgo` since its last message. */
async function chat(owner: string, minutesAgo: number, values: { video?: boolean } = {}) {
  const id = crypto.randomUUID();
  await test.raw.insert(chats).values({
    id,
    owner,
    mode: values.video ? "video" : "general",
    videoId: values.video ? videoId : null,
    title: `${owner}'s chat`,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000),
  });
  return id;
}

describe("listing chats", () => {
  it("lists only the owner's chats, most recent first", async () => {
    const older = await chat("Alex", 10);
    await chat("Sam", 5);
    const newer = await chat("Alex", 1);

    expect((await listChats("Alex")).map((row) => row.id)).toEqual([newer, older]);
    expect(await listChats("Nobody")).toEqual([]);
  });

  it("lists only the owner's chats about a video", async () => {
    const alexs = await chat("Alex", 3, { video: true });
    await chat("Sam", 2, { video: true });
    await chat("Alex", 1);

    expect((await listChatsForVideo(videoId, "Alex")).map((row) => row.id)).toEqual([alexs]);
  });
});

describe("getChat", () => {
  it("treats someone else's chat as missing when given an owner", async () => {
    const id = await chat("Sam", 1, { video: true });
    expect(await getChat(id, "Alex")).toBeNull();
    expect(await getChat(id, "Sam")).toMatchObject({ id, owner: "Sam", video: { id: videoId } });
    // Without an owner, for the chat route to tell whose it is.
    expect(await getChat(id)).toMatchObject({ id, owner: "Sam" });
  });
});

describe("renaming and deleting", () => {
  it("leave someone else's chat alone", async () => {
    const id = await chat("Sam", 1);

    expect(await updateChatTitle(id, "Alex", "Mine now")).toBe(false);
    expect(await deleteChatById(id, "Alex")).toBe(false);
    const [row] = await test.raw.select().from(chats).where(eq(chats.id, id));
    expect(row.title).toBe("Sam's chat");
  });

  it("change the owner's own chat", async () => {
    const id = await chat("Alex", 1);

    expect(await updateChatTitle(id, "Alex", "Bread timing")).toBe(true);
    expect((await getChat(id, "Alex"))?.title).toBe("Bread timing");
    expect(await deleteChatById(id, "Alex")).toBe(true);
    expect(await getChat(id)).toBeNull();
  });
});

describe("creating chats", () => {
  it("saves the first exchange under its owner", async () => {
    const id = crypto.randomUUID();
    await saveExchange(
      { id, mode: "library", videoId: null, owner: "Sam" },
      { content: "What did the videos say about yeast?" },
      { content: "It eats sugar." },
    );
    expect(await getChat(id, "Sam")).toMatchObject({ id, owner: "Sam", mode: "library" });
  });

  it("refuses to add to someone else's chat with the same ID", async () => {
    const id = await chat("Sam", 1);
    await expect(
      createChatIfMissing({ id, mode: "general", videoId: null, owner: "Alex" }),
    ).rejects.toBeInstanceOf(ChatConflictError);
    expect(await createChatIfMissing({ id, mode: "general", videoId: null, owner: "Sam" })).toMatchObject({
      id,
      owner: "Sam",
    });
  });
});

import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifySessionToken } from "@/lib/auth/session";
import { deleteChatById, updateChatTitle } from "@/lib/db/queries/chats";
import { DATABASE_UNREACHABLE, SIGNED_OUT } from "@/lib/errors";
import { deleteChat, renameChat } from "./chats";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Every request carries a cookie; verifySessionToken decides who, if anyone, it's for.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/lib/auth/session", () => ({ SESSION_COOKIE: "na_session", verifySessionToken: vi.fn() }));
vi.mock("@/lib/db/queries/chats", () => ({
  updateChatTitle: vi.fn(),
  deleteChatById: vi.fn(),
}));

const CHAT_ID = "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifySessionToken).mockResolvedValue({ person: "Alex" });
  vi.mocked(updateChatTitle).mockResolvedValue(true);
  vi.mocked(deleteChatById).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renameChat", () => {
  it("saves the trimmed title on your chat and revalidates the chats pages", async () => {
    expect(await renameChat({ chatId: CHAT_ID, title: "  Bread timing  " })).toEqual({
      kind: "renamed",
      title: "Bread timing",
    });
    expect(updateChatTitle).toHaveBeenCalledExactlyOnceWith(CHAT_ID, "Alex", "Bread timing");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/chats", "layout");
  });

  it.each([
    ["an empty title", "   ", "Give the chat a title."],
    ["a title over 80 characters", "x".repeat(81), "Keep the title to 80 characters or fewer."],
  ])("rejects %s", async (_, title, message) => {
    expect(await renameChat({ chatId: CHAT_ID, title })).toEqual({ kind: "error", message });
    expect(updateChatTitle).not.toHaveBeenCalled();
  });

  it("accepts a title of exactly 80 characters", async () => {
    expect(await renameChat({ chatId: CHAT_ID, title: "x".repeat(80) })).toMatchObject({
      kind: "renamed",
    });
  });

  it("rejects an ID that isn't a UUID", async () => {
    expect(await renameChat({ chatId: "abc", title: "Bread" })).toEqual({
      kind: "error",
      message: "That isn't a saved chat.",
    });
  });

  it("refuses a signed-out device", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(await renameChat({ chatId: CHAT_ID, title: "Bread" })).toEqual({
      kind: "error",
      message: SIGNED_OUT,
    });
    expect(updateChatTitle).not.toHaveBeenCalled();
  });

  it("says so when the chat is gone, or someone else's", async () => {
    vi.mocked(updateChatTitle).mockResolvedValue(false);
    expect(await renameChat({ chatId: CHAT_ID, title: "Bread" })).toEqual({
      kind: "error",
      message: "This chat doesn't exist anymore.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the database fails", async () => {
    vi.mocked(updateChatTitle).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await renameChat({ chatId: CHAT_ID, title: "Bread" })).toEqual({
      kind: "error",
      message: "Couldn't rename the chat. Try again.",
    });
    expect(console.error).toHaveBeenCalledWith("renameChat failed:", expect.any(Error));
  });
});

describe("deleteChat", () => {
  it("deletes your chat and revalidates the chats pages", async () => {
    expect(await deleteChat(CHAT_ID)).toEqual({ kind: "deleted" });
    expect(deleteChatById).toHaveBeenCalledExactlyOnceWith(CHAT_ID, "Alex");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/chats", "layout");
  });

  it("treats a chat that's already gone as deleted", async () => {
    vi.mocked(deleteChatById).mockResolvedValue(false);
    expect(await deleteChat(CHAT_ID)).toEqual({ kind: "deleted" });
  });

  it("refuses a signed-out device", async () => {
    vi.mocked(verifySessionToken).mockResolvedValue(null);
    expect(await deleteChat(CHAT_ID)).toEqual({ kind: "error", message: SIGNED_OUT });
    expect(deleteChatById).not.toHaveBeenCalled();
  });

  it("rejects an ID that isn't a UUID", async () => {
    expect(await deleteChat("../library")).toEqual({
      kind: "error",
      message: "That isn't a saved chat.",
    });
    expect(deleteChatById).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the database fails", async () => {
    vi.mocked(deleteChatById).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await deleteChat(CHAT_ID)).toEqual({
      kind: "error",
      message: "Couldn't delete the chat. Try again.",
    });
  });

  it("says so when the database can't be reached", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    vi.mocked(deleteChatById).mockRejectedValue(refused);
    expect(await deleteChat(CHAT_ID)).toEqual({ kind: "error", message: DATABASE_UNREACHABLE });
  });
});

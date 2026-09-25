import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rewriteModel } from "@/lib/ai/models";
import { TITLE_INSTRUCTIONS } from "@/lib/ai/prompts/title";
import { cleanGeneratedTitle, fallbackTitle, generateChatTitle } from "./title";

vi.mock("@/lib/ai/models", () => ({ rewriteModel: vi.fn() }));

const usage = {
  inputTokens: { total: 40, noCache: 40, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 6, text: 6, reasoning: undefined },
};

function replying(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "STOP" },
      usage,
      warnings: [],
    }),
  });
}

describe("fallbackTitle", () => {
  it("keeps a short question as it is", () => {
    expect(fallbackTitle("How does bread rise?")).toBe("How does bread rise?");
  });

  it("collapses whitespace and line breaks", () => {
    expect(fallbackTitle("  How does\n\nbread   rise?  ")).toBe("How does bread rise?");
  });

  it("keeps a question of exactly the maximum length", () => {
    const question = "a".repeat(59) + "?";
    expect(fallbackTitle(question)).toBe(question);
  });

  it("cuts a long question at a word boundary and adds an ellipsis", () => {
    const title = fallbackTitle(
      "What does the host say about proofing dough overnight in the fridge versus on the counter?",
    );
    expect(title).toBe("What does the host say about proofing dough overnight in…");
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("drops punctuation left before the ellipsis", () => {
    expect(fallbackTitle("First, second, third, fourth, fifth, sixth, seventh, eighth, ninth", 30)).toBe(
      "First, second, third, fourth…",
    );
  });

  it("cuts a single long word mid-word", () => {
    const title = fallbackTitle("x".repeat(100));
    expect(title).toBe("x".repeat(59) + "…");
  });

  it("names an empty question", () => {
    expect(fallbackTitle("   \n ")).toBe("New chat");
  });
});

describe("cleanGeneratedTitle", () => {
  it.each([
    ["Bread proofing times", "Bread proofing times"],
    ['"Bread proofing times"', "Bread proofing times"],
    ["Title: Bread proofing times", "Bread proofing times"],
    ["**Bread proofing times**", "Bread proofing times"],
    ["# Bread proofing times.", "Bread proofing times"],
    ["Bread proofing times…", "Bread proofing times…"],
    ["\n\nBread proofing times\nA chat about dough.", "Bread proofing times"],
  ])("turns %j into %j", (reply, title) => {
    expect(cleanGeneratedTitle(reply)).toBe(title);
  });

  it("shortens a reply that ran long", () => {
    expect(cleanGeneratedTitle("word ".repeat(30))!.length).toBeLessThanOrEqual(60);
  });

  it("returns null when nothing is left", () => {
    expect(cleanGeneratedTitle(' "" \n')).toBeNull();
  });
});

describe("generateChatTitle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the rewrite model and tidies its reply", async () => {
    const model = replying('"Why bread rises."');
    vi.mocked(rewriteModel).mockReturnValue(model);

    expect(await generateChatTitle("Why does my bread rise so much overnight?")).toBe(
      "Why bread rises",
    );
    const [call] = model.doGenerateCalls;
    expect(call.prompt[0]).toEqual({ role: "system", content: TITLE_INSTRUCTIONS });
    expect(call.prompt[1]).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: "<message>\nWhy does my bread rise so much overnight?\n</message>" },
      ],
    });
  });

  it("falls back to the question when the model fails", async () => {
    vi.mocked(rewriteModel).mockReturnValue(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("503 Service Unavailable");
        },
      }),
    );
    expect(await generateChatTitle("Why does bread rise?")).toBe("Why does bread rise?");
    expect(console.warn).toHaveBeenCalled();
  });

  it("falls back to the question when the model returns nothing", async () => {
    vi.mocked(rewriteModel).mockReturnValue(replying("   "));
    expect(await generateChatTitle("Why does bread rise?")).toBe("Why does bread rise?");
  });
});

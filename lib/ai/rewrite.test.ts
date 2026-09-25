import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rewriteModel } from "@/lib/ai/models";
import { REWRITE_INSTRUCTIONS, REWRITE_MESSAGE_CHARS } from "@/lib/ai/prompts/rewrite";
import { rewriteQuery } from "./rewrite";

vi.mock("@/lib/ai/models", () => ({ rewriteModel: vi.fn() }));

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 12, text: 12, reasoning: undefined },
};

function replying(text: string) {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "STOP" },
      usage,
      warnings: [],
    }),
  });
  vi.mocked(rewriteModel).mockReturnValue(model);
  return model;
}

const HISTORY = [
  { role: "user" as const, content: "What does the Kitchen Lab video say about sourdough starters?" },
  {
    role: "assistant" as const,
    content: "It says a starter needs feeding every day [1 @ 2:10].",
  },
];
const FOLLOW_UP = "what else did they say about it?";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rewriteQuery", () => {
  it("uses a chat's first question as asked, without calling the model", async () => {
    expect(await rewriteQuery("How does bread rise?", [])).toBe("How does bread rise?");
    expect(rewriteModel).not.toHaveBeenCalled();
  });

  it("rewrites a follow-up into a standalone question from the conversation", async () => {
    const model = replying("What else does the Kitchen Lab video say about sourdough starters?");

    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe(
      "What else does the Kitchen Lab video say about sourdough starters?",
    );

    const [call] = model.doGenerateCalls;
    expect(call.prompt[0]).toEqual({ role: "system", content: REWRITE_INSTRUCTIONS });
    expect(JSON.stringify(call.prompt[1])).toContain(
      "User: What does the Kitchen Lab video say about sourdough starters?",
    );
    expect(JSON.stringify(call.prompt[1])).toContain(
      "Assistant: It says a starter needs feeding every day [1 @ 2:10].",
    );
    expect(JSON.stringify(call.prompt[1])).toContain(`<follow_up>\\n${FOLLOW_UP}\\n</follow_up>`);
  });

  it("sends only the recent conversation, with long answers cut", async () => {
    const model = replying("A question");
    const history = [
      { role: "user" as const, content: "The oldest question" },
      ...Array.from({ length: 6 }, (_, index) => ({
        role: index % 2 === 0 ? ("assistant" as const) : ("user" as const),
        content: index === 0 ? "x".repeat(5_000) : `Message ${index}`,
      })),
    ];

    await rewriteQuery(FOLLOW_UP, history);

    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt[1]);
    expect(prompt).not.toContain("The oldest question");
    expect(prompt).toContain(`${"x".repeat(REWRITE_MESSAGE_CHARS)}…`);
    expect(prompt).not.toContain("x".repeat(REWRITE_MESSAGE_CHARS + 1));
  });

  it("strips quotes and a label the model added", async () => {
    replying('Standalone question: "What else does the video say about starters?"\n');
    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe("What else does the video say about starters?");
  });

  it("falls back to the question when the call fails", async () => {
    vi.mocked(rewriteModel).mockReturnValue(
      new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("503 Service Unavailable");
        },
      }),
    );
    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe(FOLLOW_UP);
    expect(console.warn).toHaveBeenCalled();
  });

  it("falls back to the question when the rewrite is empty", async () => {
    replying("  \n ");
    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe(FOLLOW_UP);
  });

  it("falls back to the question when the rewrite runs over 500 characters", async () => {
    replying(`What ${"else ".repeat(120)}did they say?`);
    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe(FOLLOW_UP);
  });

  it("falls back to the question when the settings are missing", async () => {
    vi.mocked(rewriteModel).mockImplementation(() => {
      throw new Error("GEMINI_REWRITE_MODEL is missing");
    });
    expect(await rewriteQuery(FOLLOW_UP, HISTORY)).toBe(FOLLOW_UP);
  });
});

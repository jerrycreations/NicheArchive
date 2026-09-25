import { APICallError, simulateReadableStream, type FinishReason } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { after } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigError } from "@/lib/ai/errors";
import { chatModel } from "@/lib/ai/models";
import { generateChatTitle } from "@/lib/ai/title";
import { prepareLibraryAnswer } from "@/lib/chat/library";
import { NO_MATCH_REPLY } from "@/lib/chat/sources";
import { getChat, setChatTitleIfEmpty } from "@/lib/db/queries/chats";
import { listMessages, saveExchange } from "@/lib/db/queries/messages";
import { getVideoById, getVideoByYoutubeId } from "@/lib/db/queries/videos";
import type { ChatWithVideo, MessageRow, VideoRow } from "@/lib/db/types";
import { POST } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/ai/models", () => ({ chatModel: vi.fn() }));
vi.mock("@/lib/ai/title", () => ({ generateChatTitle: vi.fn() }));
vi.mock("@/lib/chat/library", () => ({ prepareLibraryAnswer: vi.fn() }));
vi.mock("@/lib/db/queries/chats", () => ({ getChat: vi.fn(), setChatTitleIfEmpty: vi.fn() }));
vi.mock("@/lib/db/queries/messages", () => ({ listMessages: vi.fn(), saveExchange: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({
  getVideoById: vi.fn(),
  getVideoByYoutubeId: vi.fn(),
}));

const CHAT_ID = "7d3f7c52-5f1e-4a3b-9a57-2f1c7e4b8d10";
const MESSAGE_ID = "0b6c1f7e-3a54-4c8e-8f0e-5d2b9a1c4e77";
const VIDEO_ID = "5a1e9c3b-2d4f-4e6a-9b8c-7d0e1f2a3b4c";
const YOUTUBE_ID = "dQw4w9WgXcQ";

const video = {
  id: VIDEO_ID,
  youtubeId: YOUTUBE_ID,
  title: "How Bread Rises",
  channel: "The Kitchen Lab",
  durationSeconds: 247,
  status: "ready",
  transcriptSegments: [{ start: 42, duration: 3, text: "Yeast eats sugar." }],
  timestampsEstimated: false,
} as VideoRow;

const usage = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 8, text: 8, reasoning: undefined },
};

type ModelFinish = { unified: FinishReason; raw: string };

function answering(...deltas: string[]) {
  return ending({ unified: "stop", raw: "STOP" }, ...deltas);
}

function ending(finishReason: ModelFinish, ...deltas: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          ...deltas.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end" as const, id: "t" },
          { type: "finish" as const, finishReason, usage },
        ],
      }),
    }),
  });
}

function failingWith(error: unknown) {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw error;
    },
  });
}

function useModel(model: MockLanguageModelV4) {
  vi.mocked(chatModel).mockReturnValue(model);
  return model;
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const ask = (text: string, extra: object = {}) => ({
  chatId: CHAT_ID,
  mode: "video",
  youtubeId: YOUTUBE_ID,
  message: { id: MESSAGE_ID, text },
  ...extra,
});

/** Reads the whole streamed reply, then waits for the work after() was given. */
async function finish(response: Response) {
  const body = await response.text();
  for (const [task] of vi.mocked(after).mock.calls) {
    await (task as () => Promise<void>)();
  }
  return body;
}

async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getChat).mockResolvedValue(null);
  vi.mocked(getVideoByYoutubeId).mockResolvedValue(video);
  vi.mocked(getVideoById).mockResolvedValue(video);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(generateChatTitle).mockResolvedValue("Why bread rises");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  it("streams an answer about the video and saves the exchange with a title", async () => {
    const model = useModel(answering("Yeast eats sugar ", "[0:42]."));
    const response = await post(ask("  Why does bread rise?  "));
    expect(response.status).toBe(200);

    const body = await finish(response);
    expect(body).toContain('"delta":"Yeast eats sugar "');

    const [call] = model.doStreamCalls;
    const [system, user] = call.prompt;
    expect(system.role).toBe("system");
    expect(system.content).toContain("[0:42] Yeast eats sugar.");
    expect(user).toEqual({
      role: "user",
      content: [{ type: "text", text: "Why does bread rise?" }],
    });

    expect(saveExchange).toHaveBeenCalledExactlyOnceWith(
      { id: CHAT_ID, mode: "video", videoId: VIDEO_ID },
      { id: MESSAGE_ID, content: "Why does bread rise?" },
      { id: expect.any(String), content: "Yeast eats sugar [0:42]." },
    );
    // The answer's ID in the stream is the one it's saved with.
    const answerId = vi.mocked(saveExchange).mock.calls[0][2].id;
    expect(body).toContain(`"messageId":"${answerId}"`);
    expect(generateChatTitle).toHaveBeenCalledWith("Why does bread rise?");
    expect(setChatTitleIfEmpty).toHaveBeenCalledWith(CHAT_ID, "Why bread rises");
  });

  it("keeps a saved chat's own mode and video, and sends its history", async () => {
    vi.mocked(getChat).mockResolvedValue({
      id: CHAT_ID,
      mode: "video",
      videoId: VIDEO_ID,
      title: "Why bread rises",
    } as ChatWithVideo);
    vi.mocked(listMessages).mockResolvedValue([
      { role: "user", content: "Why does bread rise?" },
      { role: "assistant", content: "Yeast [0:42]." },
    ] as MessageRow[]);
    const model = useModel(answering("About an hour."));

    // The client claims a general chat; the saved chat is about a video.
    await finish(await post(ask("How long?", { mode: "general", youtubeId: undefined })));

    expect(getVideoById).toHaveBeenCalledWith(VIDEO_ID);
    const [system, ...rest] = model.doStreamCalls[0].prompt;
    expect(system.content).toContain("Yeast eats sugar.");
    expect(rest.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(saveExchange).toHaveBeenCalledWith(
      { id: CHAT_ID, mode: "video", videoId: VIDEO_ID },
      expect.anything(),
      expect.anything(),
    );
    expect(generateChatTitle).not.toHaveBeenCalled();
  });

  it("answers a general chat without a transcript", async () => {
    const model = useModel(answering("Hello."));
    await finish(await post(ask("Hi", { mode: "general", youtubeId: undefined })));

    expect(model.doStreamCalls[0].prompt[0].content).toContain("no transcripts attached");
    expect(getVideoByYoutubeId).not.toHaveBeenCalled();
    expect(saveExchange).toHaveBeenCalledWith(
      { id: CHAT_ID, mode: "general", videoId: null },
      expect.anything(),
      expect.anything(),
    );
  });

  it("sends the rate-limit message in the stream and saves nothing", async () => {
    useModel(
      failingWith(
        new APICallError({
          message: "You exceeded your current quota.",
          url: "https://generativelanguage.googleapis.com",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: false,
        }),
      ),
    );
    const body = await finish(await post(ask("Why does bread rise?")));

    expect(body).toContain('"errorText":"Gemini\'s free limit was reached. Try again in a minute."');
    expect(saveExchange).not.toHaveBeenCalled();
    expect(setChatTitleIfEmpty).not.toHaveBeenCalled();
  });

  it("saves nothing when Gemini stops partway, and says why in the stream", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    useModel(ending({ unified: "content-filter", raw: "RECITATION" }, "The speaker says that they"));
    const body = await finish(await post(ask("Why does bread rise?")));

    expect(body).toContain('"finishReason":"content-filter"');
    expect(saveExchange).not.toHaveBeenCalled();
    expect(setChatTitleIfEmpty).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("RECITATION"));
  });

  it("saves nothing for an empty answer", async () => {
    useModel(answering());
    await finish(await post(ask("Why does bread rise?")));
    expect(saveExchange).not.toHaveBeenCalled();
  });

  it("answers 409 while the transcript isn't ready", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue({ ...video, status: "pending" });
    await expectError(await post(ask("Hi")), 409, "This video's transcript isn't ready yet.");
    expect(chatModel).not.toHaveBeenCalled();
  });

  it("answers 404 for a video that isn't saved", async () => {
    vi.mocked(getVideoByYoutubeId).mockResolvedValue(null);
    await expectError(await post(ask("Hi")), 404, "This video isn't in the library anymore.");
  });

  describe("in a library chat", () => {
    const askLibrary = (text: string) => ask(text, { mode: "library", youtubeId: undefined });
    const videoSources = {
      kind: "videos" as const,
      videos: [
        { index: 1, youtubeId: YOUTUBE_ID, title: "How Bread Rises", channel: "The Kitchen Lab", timestamps: [40] },
      ],
    };

    it("replies that nothing matched without asking Gemini, and saves that", async () => {
      const noMatch = { kind: "no_match" as const, question: "What is sourdough?" };
      vi.mocked(prepareLibraryAnswer).mockResolvedValue({ kind: "no_match", sources: noMatch });

      const response = await post(askLibrary("What is sourdough?"));
      const body = await finish(response);

      expect(response.status).toBe(200);
      expect(chatModel).not.toHaveBeenCalled();
      expect(body).toContain(`"type":"data-sources","data":${JSON.stringify(noMatch)}`);
      expect(body).toContain(`"delta":${JSON.stringify(NO_MATCH_REPLY)}`);
      expect(body).toContain('"finishReason":"stop"');
      expect(saveExchange).toHaveBeenCalledExactlyOnceWith(
        { id: CHAT_ID, mode: "library", videoId: null },
        { id: MESSAGE_ID, content: "What is sourdough?" },
        { id: expect.any(String), content: NO_MATCH_REPLY, sources: noMatch },
      );
      const answerId = vi.mocked(saveExchange).mock.calls[0][2].id;
      expect(body).toContain(`"messageId":"${answerId}"`);
      expect(setChatTitleIfEmpty).toHaveBeenCalledWith(CHAT_ID, "Why bread rises");
    });

    it("sends the sources ahead of Gemini's answer from the chosen videos, and saves them", async () => {
      vi.mocked(prepareLibraryAnswer).mockResolvedValue({
        kind: "videos",
        instructions: "Answer only from <video number=\"1\">",
        sources: videoSources,
      });
      const model = useModel(answering("Yeast eats sugar [1 @ 0:42]."));

      const body = await finish(await post(askLibrary("Why does bread rise?")));

      expect(model.doStreamCalls[0].prompt[0]).toEqual({
        role: "system",
        content: 'Answer only from <video number="1">',
      });
      const sourcesAt = body.indexOf('"type":"data-sources"');
      expect(sourcesAt).toBeGreaterThan(body.indexOf('"type":"start"'));
      expect(sourcesAt).toBeLessThan(body.indexOf('"type":"text-delta"'));
      // One start, carrying the saved answer's ID.
      expect(body.match(/"type":"start"/g)).toHaveLength(1);
      expect(saveExchange).toHaveBeenCalledExactlyOnceWith(
        { id: CHAT_ID, mode: "library", videoId: null },
        { id: MESSAGE_ID, content: "Why does bread rise?" },
        { id: expect.any(String), content: "Yeast eats sugar [1 @ 0:42].", sources: videoSources },
      );
      const answerId = vi.mocked(saveExchange).mock.calls[0][2].id;
      expect(body).toContain(`"messageId":"${answerId}"`);
    });

    it("searches with the conversation so far", async () => {
      vi.mocked(getChat).mockResolvedValue({
        id: CHAT_ID,
        mode: "library",
        videoId: null,
        title: "Bread",
      } as ChatWithVideo);
      const history = [
        { role: "user", content: "Why does bread rise?" },
        { role: "assistant", content: "Yeast [1 @ 0:42]." },
      ] as MessageRow[];
      vi.mocked(listMessages).mockResolvedValue(history);
      vi.mocked(prepareLibraryAnswer).mockResolvedValue({
        kind: "videos",
        instructions: "Answer only from the videos.",
        sources: videoSources,
      });
      useModel(answering("An hour [1 @ 1:10]."));

      await finish(await post(askLibrary("How long does it take?")));

      expect(prepareLibraryAnswer).toHaveBeenCalledWith("How long does it take?", history, {
        abortSignal: expect.any(AbortSignal),
      });
    });

    it("answers 429 when searching hits Gemini's rate limit, and saves nothing", async () => {
      vi.mocked(prepareLibraryAnswer).mockRejectedValue(
        new APICallError({
          message: "You exceeded your current quota.",
          url: "https://generativelanguage.googleapis.com",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        }),
      );
      await expectError(
        await post(askLibrary("Why does bread rise?")),
        429,
        "Gemini's free limit was reached. Try again in a minute.",
      );
      expect(saveExchange).not.toHaveBeenCalled();
    });

    it("answers 500 when the search can't reach the database", async () => {
      vi.mocked(prepareLibraryAnswer).mockRejectedValue(new Error("ECONNREFUSED"));
      await expectError(
        await post(askLibrary("Why does bread rise?")),
        500,
        "Something went wrong on the server. Try again.",
      );
    });

    it("answers 504 when the search takes too long", async () => {
      vi.mocked(prepareLibraryAnswer).mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
      await expectError(
        await post(askLibrary("Why does bread rise?")),
        504,
        "Searching your videos took too long. Try again.",
      );
    });
  });

  it("answers 503 when the Gemini settings are missing", async () => {
    vi.mocked(chatModel).mockImplementation(() => {
      throw new AiConfigError("bad_key", "GOOGLE_GENERATIVE_AI_API_KEY is missing");
    });
    const response = await post(ask("Hi"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("answers 500 when the database can't be reached", async () => {
    vi.mocked(getChat).mockRejectedValue(new Error("ECONNREFUSED"));
    await expectError(
      await post(ask("Hi")),
      500,
      "Something went wrong on the server. Try again.",
    );
  });

  it.each([
    ["a message over 8,000 characters", ask("x".repeat(8001)), "Keep your message to 8,000 characters or fewer."],
    ["an empty message", ask("   "), "Type a message first."],
    ["a video chat without a video", ask("Hi", { youtubeId: undefined }), "That isn't a valid chat request."],
    ["a chat ID that isn't a UUID", ask("Hi", { chatId: "abc" }), "That isn't a valid chat request."],
  ])("rejects %s with 400", async (_, body, error) => {
    await expectError(await post(body), 400, error);
    expect(getChat).not.toHaveBeenCalled();
  });
});

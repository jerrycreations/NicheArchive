import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigError } from "@/lib/ai/errors";
import { chatModel } from "@/lib/ai/models";
import { TRANSCRIBE_INSTRUCTIONS } from "@/lib/ai/prompts/transcribe";
import { transcribeWithGemini } from "./transcribe";

vi.mock("@/lib/ai/models", () => ({ chatModel: vi.fn() }));

const ID = "dQw4w9WgXcQ";
const VIDEO = { youtubeId: ID, durationSeconds: 214 };

const usage = {
  inputTokens: { total: 21_000, noCache: 21_000, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 80, text: 80, reasoning: undefined },
};

type FinishReason = "stop" | "length" | "content-filter";

function mockModel(respond: () => { text: string; finishReason?: FinishReason }) {
  return new MockLanguageModelV4({
    // Gemini reads YouTube links itself. Without this the SDK would try to
    // download the watch page and send it as bytes.
    supportedUrls: { "*": [/^https:\/\/www\.youtube\.com\/watch\?v=/] },
    doGenerate: async () => {
      const { text, finishReason = "stop" } = respond();
      return {
        content: text ? [{ type: "text", text }] : [],
        finishReason: { unified: finishReason, raw: finishReason.toUpperCase() },
        usage,
        warnings: [],
      };
    },
  });
}

function useModel(model: MockLanguageModelV4) {
  vi.mocked(chatModel).mockReturnValue(model);
  return model;
}

function failingModel(error: unknown) {
  return new MockLanguageModelV4({
    supportedUrls: { "*": [/^https:\/\/www\.youtube\.com\/watch\?v=/] },
    doGenerate: async () => {
      throw error;
    },
  });
}

const segmentsJson = (segments: { start: string; text: string }[]) => JSON.stringify({ segments });

beforeEach(() => {
  vi.resetAllMocks();
  // Nothing here may reach the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Tests must not fetch.");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcribeWithGemini", () => {
  it("sends the video link at low resolution and returns timed segments", async () => {
    const model = useModel(
      mockModel(() => ({
        text: segmentsJson([
          { start: "0:18", text: "We're no strangers to love." },
          { start: "0:22", text: "You know the rules, and so do I." },
        ]),
      })),
    );

    expect(await transcribeWithGemini(VIDEO)).toEqual({
      ok: true,
      source: "gemini",
      segments: [
        { start: 18, duration: 4, text: "We're no strangers to love." },
        { start: 22, duration: 8 / 2.5, text: "You know the rules, and so do I." },
      ],
    });

    const [call] = model.doGenerateCalls;
    expect(call.prompt[0]).toEqual({ role: "system", content: TRANSCRIBE_INSTRUCTIONS });
    const user = call.prompt[1];
    expect(user.role).toBe("user");
    const [file, request] = user.content as { type: string; data?: unknown; text?: string }[];
    expect(file).toMatchObject({ type: "file", mediaType: "video/mp4", data: { type: "url" } });
    // Passed through as a link for Gemini to open, not downloaded.
    expect(String((file.data as { url: URL }).url)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(request).toMatchObject({ type: "text", text: expect.stringContaining("It's 3:34 long") });
    expect(call.providerOptions).toEqual({ google: { mediaResolution: "MEDIA_RESOLUTION_LOW" } });
    expect(call.responseFormat).toMatchObject({ type: "json" });
    expect(call.temperature).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["text that isn't JSON", "Sorry, I can't watch videos."],
    ["JSON in the wrong shape", JSON.stringify({ lines: ["hello"] })],
  ])("reports %s as invalid output", async (_, text) => {
    useModel(mockModel(() => ({ text })));
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({
      ok: false,
      reason: "invalid_output",
      message: "Gemini's transcript came back in a form this app couldn't read.",
    });
  });

  it("reports a transcript cut off at the output limit as too long", async () => {
    useModel(mockModel(() => ({ text: '{"segments":[{"start":"0:00","te', finishReason: "length" })));
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({ ok: false, reason: "too_long" });
  });

  it("reports an answer stopped by the safety filters as blocked", async () => {
    useModel(mockModel(() => ({ text: "", finishReason: "content-filter" })));
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({
      ok: false,
      reason: "blocked",
      message: "Gemini's safety filters blocked this video.",
    });
  });

  it("reports no speech when Gemini returns no segments", async () => {
    useModel(mockModel(() => ({ text: segmentsJson([]) })));
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({
      ok: false,
      reason: "no_speech",
      message: "Gemini didn't hear any English speech in this video.",
    });
  });

  it("reports Gemini's rate limit with the try-again message", async () => {
    const quota = new APICallError({
      message: "You exceeded your current quota.",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      requestBodyValues: {},
      statusCode: 429,
      responseBody: JSON.stringify({
        error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota." },
      }),
      // Not retryable, so the SDK fails at once instead of backing off.
      isRetryable: false,
    });
    useModel(failingModel(quota));
    expect(await transcribeWithGemini(VIDEO)).toEqual({
      ok: false,
      reason: "rate_limited",
      message: "Gemini's free limit was reached. Try again in a minute.",
      detail: "AI_APICallError: You exceeded your current quota.",
    });
  });

  it("reports a missing API key without calling Gemini", async () => {
    vi.mocked(chatModel).mockImplementation(() => {
      throw new AiConfigError("bad_key", "GOOGLE_GENERATIVE_AI_API_KEY is missing");
    });
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({
      ok: false,
      reason: "bad_key",
      message: expect.stringContaining("GOOGLE_GENERATIVE_AI_API_KEY"),
    });
  });

  it("reports running out of time", async () => {
    useModel(failingModel(new DOMException("The operation timed out.", "TimeoutError")));
    expect(await transcribeWithGemini(VIDEO)).toMatchObject({
      ok: false,
      reason: "timeout",
      message: "Gemini didn't finish within 4 minutes.",
    });
  });
});

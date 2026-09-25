import { APICallError } from "ai";
import { MockEmbeddingModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyAiError } from "@/lib/ai/errors";
import { embeddingModel, embeddingModelId } from "@/lib/ai/models";
import { buildChunkEmbeddingInput } from "@/lib/search/embedding-input";
import { embedDocuments, EmbeddingConfigError, embedQuery } from "./embed";

vi.mock("@/lib/ai/models", () => ({ embeddingModel: vi.fn(), embeddingModelId: vi.fn() }));

const DIMENSIONS = 768;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents";

/** A 768-number vector starting with `head`, zeros after. */
function vector(...head: number[]): number[] {
  return [...head, ...Array<number>(DIMENSIONS - head.length).fill(0)];
}

type DoEmbed = MockEmbeddingModelV4["doEmbed"];

/** A model that answers every value with `embedding(value)`, 3-4-0… unless given. */
function useModel(modelId: string, doEmbed?: DoEmbed) {
  const model = new MockEmbeddingModelV4({
    modelId,
    maxEmbeddingsPerCall: 100,
    doEmbed:
      doEmbed ??
      (async ({ values }) => ({ embeddings: values.map(() => vector(3, 4)), warnings: [] })),
  });
  vi.mocked(embeddingModel).mockReturnValue(model);
  vi.mocked(embeddingModelId).mockReturnValue(modelId);
  return model;
}

function rateLimited({ retryAfter, daily }: { retryAfter?: string; daily?: boolean } = {}) {
  const body = {
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota.",
      details: daily
        ? [
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [{ quotaId: "EmbedContentRequestsPerDayPerProjectPerModel-FreeTier" }],
            },
          ]
        : [],
    },
  };
  return new APICallError({
    message: body.error.message,
    url: ENDPOINT,
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: retryAfter ? { "retry-after": retryAfter } : {},
    responseBody: JSON.stringify(body),
    data: body,
    isRetryable: true,
  });
}

/** Fails with each error in turn, then answers normally. */
function failingThen(errors: unknown[]): DoEmbed {
  let calls = 0;
  return async ({ values }) => {
    const error = errors[calls++];
    if (error) throw error;
    return { embeddings: values.map(() => vector(1)), warnings: [] };
  };
}

const docs = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ title: "Bread (Kitchen Lab)", text: `chunk ${index}` }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EMBEDDING_DIMENSIONS", "768");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Tests must not fetch.");
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("embedDocuments", () => {
  it("scales each vector to unit length", async () => {
    useModel("gemini-embedding-2");
    const [embedding] = await embedDocuments(docs(1));
    expect(embedding.slice(0, 3)).toEqual([0.6, 0.8, 0]);
    expect(Math.hypot(...embedding)).toBeCloseTo(1, 10);
  });

  it("writes Gemini Embedding 2's document format into the text, without a task type", async () => {
    const model = useModel("gemini-embedding-2");
    await embedDocuments([{ title: "How Bread Rises (The Kitchen Lab)", text: "Yeast eats sugar." }]);

    expect(model.doEmbedCalls[0].values).toEqual([
      "title: How Bread Rises (The Kitchen Lab) | text: Yeast eats sugar.",
    ]);
    expect(model.doEmbedCalls[0].providerOptions).toEqual({
      google: { outputDimensionality: 768 },
    });
  });

  it("sends a task type to models that take one", async () => {
    const model = useModel("gemini-embedding-001");
    await embedDocuments([{ title: "How Bread Rises", text: "Yeast eats sugar." }]);

    expect(model.doEmbedCalls[0].values).toEqual(["How Bread Rises\n\nYeast eats sugar."]);
    expect(model.doEmbedCalls[0].providerOptions).toEqual({
      google: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" },
    });
  });

  it("sends batches of up to 100, one at a time, and keeps the order", async () => {
    const model = useModel("gemini-embedding-2", async ({ values }) => ({
      // Each vector points along the axis of its chunk number.
      embeddings: values.map((value) => {
        const index = Number(/chunk (\d+)/.exec(value)![1]);
        const embedding = vector();
        embedding[index] = 2;
        return embedding;
      }),
      warnings: [],
    }));

    const embeddings = await embedDocuments(docs(250));

    expect(model.doEmbedCalls.map((call) => call.values.length)).toEqual([100, 100, 50]);
    expect(embeddings).toHaveLength(250);
    embeddings.forEach((embedding, index) => expect(embedding[index]).toBe(1));
  });

  it("makes no call for no documents", async () => {
    const model = useModel("gemini-embedding-2");
    expect(await embedDocuments([])).toEqual([]);
    expect(model.doEmbedCalls).toHaveLength(0);
  });

  it("throws EmbeddingConfigError when the vectors aren't 768 long", async () => {
    useModel("gemini-embedding-2", async ({ values }) => ({
      embeddings: values.map(() => Array<number>(3072).fill(0.1)),
      warnings: [],
    }));
    await expect(embedDocuments(docs(1))).rejects.toThrow(EmbeddingConfigError);
    await expect(embedDocuments(docs(1))).rejects.toThrow(/3072 numbers.*stores 768/);
  });

  it("throws EmbeddingConfigError when EMBEDDING_DIMENSIONS isn't 768", async () => {
    const model = useModel("gemini-embedding-2");
    vi.stubEnv("EMBEDDING_DIMENSIONS", "1536");
    await expect(embedDocuments(docs(1))).rejects.toThrow(EmbeddingConfigError);
    expect(model.doEmbedCalls).toHaveLength(0);
  });

  it("waits as long as retry-after says after a 429, then tries again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = useModel("gemini-embedding-2", failingThen([rateLimited({ retryAfter: "7" })]));

    const result = embedDocuments(docs(2));
    await vi.advanceTimersByTimeAsync(6_900);
    expect(model.doEmbedCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);

    expect(await result).toHaveLength(2);
    expect(model.doEmbedCalls).toHaveLength(2);
  });

  it("backs off when a 429 doesn't say how long to wait", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = useModel(
      "gemini-embedding-2",
      failingThen([rateLimited(), rateLimited()]),
    );

    const result = embedDocuments(docs(1));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(model.doEmbedCalls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await result).toHaveLength(1);
    expect(model.doEmbedCalls).toHaveLength(3);
  });

  it("gives up as rate_limited after three retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = useModel(
      "gemini-embedding-2",
      failingThen(Array.from({ length: 4 }, () => rateLimited({ retryAfter: "2" }))),
    );

    const result = embedDocuments(docs(1)).catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    expect(classifyAiError(await result)).toEqual({ kind: "rate_limited", retryAfterSeconds: 2 });
    expect(model.doEmbedCalls).toHaveLength(4);
  });

  it("doesn't retry when the daily quota is used up", async () => {
    const model = useModel("gemini-embedding-2", failingThen([rateLimited({ daily: true })]));
    const error = await embedDocuments(docs(1)).catch((caught: unknown) => caught);

    expect(classifyAiError(error)).toMatchObject({ kind: "rate_limited", daily: true });
    expect(model.doEmbedCalls).toHaveLength(1);
  });

  it("fails at once when Google asks for a wait over a minute", async () => {
    const model = useModel("gemini-embedding-2", failingThen([rateLimited({ retryAfter: "120" })]));
    const error = await embedDocuments(docs(1)).catch((caught: unknown) => caught);

    expect(classifyAiError(error)).toEqual({ kind: "rate_limited", retryAfterSeconds: 120 });
    expect(model.doEmbedCalls).toHaveLength(1);
  });

  it("stops waiting when aborted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    useModel("gemini-embedding-2", failingThen([rateLimited({ retryAfter: "30" })]));
    const controller = new AbortController();

    const result = embedDocuments(docs(1), { abortSignal: controller.signal }).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort(new DOMException("Out of time", "TimeoutError"));

    expect(await result).toMatchObject({ name: "TimeoutError" });
  });

  it("doesn't retry an error that waiting won't fix", async () => {
    const badRequest = new APICallError({
      message: "Invalid argument",
      url: ENDPOINT,
      requestBodyValues: {},
      statusCode: 400,
      isRetryable: false,
    });
    const model = useModel("gemini-embedding-2", failingThen([badRequest]));

    await expect(embedDocuments(docs(1))).rejects.toBe(badRequest);
    expect(model.doEmbedCalls).toHaveLength(1);
  });
});

describe("embedQuery", () => {
  it("writes Gemini Embedding 2's query format into the text and scales the vector", async () => {
    const model = useModel("gemini-embedding-2");
    const embedding = await embedQuery("why does bread rise?");

    expect(model.doEmbedCalls[0].values).toEqual(["task: search result | query: why does bread rise?"]);
    expect(model.doEmbedCalls[0].providerOptions).toEqual({ google: { outputDimensionality: 768 } });
    expect(embedding.slice(0, 2)).toEqual([0.6, 0.8]);
  });

  it("sends the query task type to models that take one", async () => {
    const model = useModel("gemini-embedding-001");
    await embedQuery("why does bread rise?");

    expect(model.doEmbedCalls[0].values).toEqual(["why does bread rise?"]);
    expect(model.doEmbedCalls[0].providerOptions).toEqual({
      google: { outputDimensionality: 768, taskType: "RETRIEVAL_QUERY" },
    });
  });

  it("retries once after a short wait, but not a long one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const model = useModel(
      "gemini-embedding-2",
      failingThen([rateLimited({ retryAfter: "3" }), rateLimited({ retryAfter: "3" })]),
    );

    const result = embedQuery("question").catch((error: unknown) => error);
    await vi.runAllTimersAsync();

    expect(classifyAiError(await result)).toMatchObject({ kind: "rate_limited" });
    expect(model.doEmbedCalls).toHaveLength(2);
  });
});

describe("buildChunkEmbeddingInput", () => {
  it("puts the video's title and channel above the chunk's words", () => {
    expect(
      buildChunkEmbeddingInput(
        { title: "How Bread Rises", channel: "The Kitchen Lab" },
        { text: "Yeast eats sugar." },
      ),
    ).toEqual({ title: "How Bread Rises (The Kitchen Lab)", text: "Yeast eats sugar." });
  });
});

import "server-only";
import type { GoogleEmbeddingModelOptions } from "@ai-sdk/google";
import { APICallError, embed, embedMany, RetryError } from "ai";
import { classifyAiError } from "@/lib/ai/errors";
import { embeddingModel, embeddingModelId } from "@/lib/ai/models";
import { EMBEDDING_VECTOR_DIMENSIONS } from "@/lib/constants";
import { envPick } from "@/lib/env";

/** Most inputs Gemini embeds in one request. */
const BATCH_SIZE = 100;

/** Waits before each retry when a rate-limited or busy Gemini doesn't say how long. */
const BACKOFF_SECONDS = [5, 15, 30];

/**
 * A longer suggested wait fails at once instead, with the wait in the error,
 * so the caller decides: the re-index dialog counts it down.
 */
const MAX_WAIT_SECONDS = 60;

/** Text for the search index, embedded under its title. */
export type EmbeddingDocument = { title: string; text: string };

/**
 * Thrown when the embedding settings can't fill the database's vector
 * column: EMBEDDING_DIMENSIONS is invalid, or the model returns vectors of
 * another size, which means the model or the dimension setting changed.
 */
export class EmbeddingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigError";
  }
}

type EmbedOptions = { abortSignal?: AbortSignal };

/**
 * Embeds texts for the search index, in order, as unit-length vectors.
 * Sends batches of up to 100 one at a time, retrying each up to three times
 * when Gemini is rate-limited or busy. Throws the last error otherwise, which
 * classifyAiError reads (a 429 as `rate_limited`, with any retry delay).
 */
export async function embedDocuments(
  documents: readonly EmbeddingDocument[],
  { abortSignal }: EmbedOptions = {},
): Promise<number[][]> {
  if (documents.length === 0) return [];
  const { model, modelId, dimensions } = settings();
  const values = documents.map((document) => formatDocument(modelId, document));

  const vectors: number[][] = [];
  for (let from = 0; from < values.length; from += BATCH_SIZE) {
    const batch = values.slice(from, from + BATCH_SIZE);
    const { embeddings } = await withRetries(
      () =>
        embedMany({
          model,
          values: batch,
          maxParallelCalls: 1,
          // Retries happen here instead, so they can follow Google's suggested delay.
          maxRetries: 0,
          abortSignal,
          providerOptions: { google: googleOptions(modelId, dimensions, "RETRIEVAL_DOCUMENT") },
        }),
      { abortSignal },
    );
    vectors.push(...embeddings.map(toUnitVector));
  }
  return vectors;
}

/**
 * Embeds a search question as a unit-length vector. Someone is waiting on
 * the answer, so it retries at most once, after a short wait.
 */
export async function embedQuery(text: string, { abortSignal }: EmbedOptions = {}): Promise<number[]> {
  const { model, modelId, dimensions } = settings();
  const { embedding } = await withRetries(
    () =>
      embed({
        model,
        value: formatQuery(modelId, text),
        maxRetries: 0,
        abortSignal,
        providerOptions: { google: googleOptions(modelId, dimensions, "RETRIEVAL_QUERY") },
      }),
    { abortSignal, retries: 1, maxWaitSeconds: 10 },
  );
  return toUnitVector(embedding);
}

function settings() {
  let dimensions: number;
  try {
    dimensions = envPick("EMBEDDING_DIMENSIONS").EMBEDDING_DIMENSIONS;
  } catch (error) {
    throw new EmbeddingConfigError(error instanceof Error ? error.message : String(error));
  }
  return { model: embeddingModel(), modelId: embeddingModelId(), dimensions };
}

// Gemini Embedding 2 rejects the task_type field. Google asks for the task to
// be written into the text instead, in these formats. The older models take
// task_type. Unknown models get the written form, which any model accepts.
function takesTaskType(modelId: string): boolean {
  return /^(gemini-embedding-001|text-embedding-|embedding-)/.test(modelId);
}

function formatDocument(modelId: string, { title, text }: EmbeddingDocument): string {
  return takesTaskType(modelId) ? `${title}\n\n${text}` : `title: ${title} | text: ${text}`;
}

function formatQuery(modelId: string, text: string): string {
  return takesTaskType(modelId) ? text : `task: search result | query: ${text}`;
}

function googleOptions(
  modelId: string,
  dimensions: number,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
) {
  return {
    outputDimensionality: dimensions,
    ...(takesTaskType(modelId) ? { taskType } : {}),
  } satisfies GoogleEmbeddingModelOptions;
}

/**
 * Scales a vector to length 1. Reduced-dimension output isn't always
 * normalized, and cosine search assumes it is.
 */
function toUnitVector(vector: readonly number[]): number[] {
  if (vector.length !== EMBEDDING_VECTOR_DIMENSIONS) {
    throw new EmbeddingConfigError(
      `The embedding model returned vectors of ${vector.length} numbers, but the database stores ${EMBEDDING_VECTOR_DIMENSIONS}. Check GEMINI_EMBEDDING_MODEL and EMBEDDING_DIMENSIONS.`,
    );
  }
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error("The embedding model returned an empty vector.");
  }
  return vector.map((value) => value / length);
}

async function withRetries<T>(
  call: () => Promise<T>,
  {
    abortSignal,
    retries = BACKOFF_SECONDS.length,
    maxWaitSeconds = MAX_WAIT_SECONDS,
  }: EmbedOptions & { retries?: number; maxWaitSeconds?: number },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const wait = attempt < retries ? retryWaitSeconds(error, attempt) : undefined;
      if (wait === undefined || wait > maxWaitSeconds) throw error;
      await sleep(wait * 1000, abortSignal);
    }
  }
}

/** How long to wait before trying again, or undefined when trying again won't help. */
function retryWaitSeconds(error: unknown, attempt: number): number | undefined {
  const classified = classifyAiError(error);
  if (classified.kind === "rate_limited") {
    // A used-up daily quota doesn't come back until midnight Pacific time.
    return classified.daily ? undefined : (classified.retryAfterSeconds ?? BACKOFF_SECONDS[attempt]);
  }
  // Gemini briefly overloaded or unavailable.
  const last = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(last) && (last.statusCode ?? 0) >= 500) return BACKOFF_SECONDS[attempt];
  return undefined;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

import "server-only";
import type { EmbeddingModel, LanguageModel } from "ai";
import { AiConfigError } from "@/lib/ai/errors";
import { googleProvider } from "@/lib/ai/provider";
import { envPick } from "@/lib/env";

// Model names come only from the environment, because Google renames models
// often. .env.example has the defaults.

type ModelSetting = "GEMINI_CHAT_MODEL" | "GEMINI_REWRITE_MODEL" | "GEMINI_EMBEDDING_MODEL";

function modelName(setting: ModelSetting): string {
  try {
    return envPick(setting)[setting];
  } catch (error) {
    throw new AiConfigError(
      "model_not_found",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Chat answers and video transcription. */
export function chatModel(): LanguageModel {
  return googleProvider().languageModel(modelName("GEMINI_CHAT_MODEL"));
}

/** Rewrites follow-up questions before library search; a fast, cheap model. */
export function rewriteModel(): LanguageModel {
  return googleProvider().languageModel(modelName("GEMINI_REWRITE_MODEL"));
}

/** Embeddings for library search. */
export function embeddingModel(): EmbeddingModel {
  return googleProvider().embedding(embeddingModelId());
}

/**
 * The embedding model's name. Each video records the one it was indexed
 * with, so changing it shows which videos need indexing again.
 */
export function embeddingModelId(): string {
  return modelName("GEMINI_EMBEDDING_MODEL");
}

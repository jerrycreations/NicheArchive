import "server-only";
import { createGoogle, type GoogleProvider } from "@ai-sdk/google";
import { AiConfigError } from "@/lib/ai/errors";
import { envPick } from "@/lib/env";

let provider: GoogleProvider | undefined;

/**
 * The Gemini provider, created on first use rather than at import, so
 * `next build` runs without the key. It checks only its own key, so the rest
 * of the app works while the Gemini settings are blank.
 * Throws AiConfigError when GOOGLE_GENERATIVE_AI_API_KEY isn't set.
 */
export function googleProvider(): GoogleProvider {
  if (provider) return provider;
  let apiKey: string;
  try {
    apiKey = envPick("GOOGLE_GENERATIVE_AI_API_KEY").GOOGLE_GENERATIVE_AI_API_KEY;
  } catch (error) {
    throw new AiConfigError("bad_key", error instanceof Error ? error.message : String(error));
  }
  provider = createGoogle({ apiKey });
  return provider;
}

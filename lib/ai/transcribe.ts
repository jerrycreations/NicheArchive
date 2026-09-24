import "server-only";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  AI_ERROR_KINDS,
  aiErrorMessage,
  classifyAiError,
  type AiErrorKind,
} from "@/lib/ai/errors";
import { chatModel } from "@/lib/ai/models";
import { TRANSCRIBE_INSTRUCTIONS, transcribeRequest } from "@/lib/ai/prompts/transcribe";
import { validateGeminiSegments } from "@/lib/ai/transcribe-validate";
import type { TranscriptSegment } from "@/lib/transcript/types";
import { buildWatchUrl } from "@/lib/youtube/url";

// Leaves room in the processing route's 300 seconds for the caption attempt
// before this (up to 20 seconds) and the database writes after it.
const TIMEOUT_MS = 240_000;

const transcriptSchema = z.object({
  segments: z.array(
    z.object({
      start: z.string().describe("When the segment starts in the video, as m:ss or h:mm:ss"),
      text: z.string().describe("The exact words spoken"),
    }),
  ),
});

export type TranscribeFailureReason =
  | AiErrorKind
  | "invalid_output"
  | "too_long"
  | "timeout"
  | "no_speech"
  | "bad_timestamps";

export type TranscribeResult =
  | { ok: true; source: "gemini"; segments: TranscriptSegment[] }
  | {
      ok: false;
      reason: TranscribeFailureReason;
      /** Written for the user. */
      message: string;
      /** For the server log. */
      detail: string;
    };

const MESSAGES: Record<Exclude<TranscribeFailureReason, AiErrorKind>, string> = {
  invalid_output: "Gemini's transcript came back in a form this app couldn't read.",
  too_long: "Gemini's transcript was cut off, because this video is too long for one request.",
  timeout: `Gemini didn't finish within ${TIMEOUT_MS / 60_000} minutes.`,
  no_speech: "Gemini didn't hear any English speech in this video.",
  bad_timestamps: "Gemini's transcript had too many unusable timestamps.",
};

// Where the general Gemini messages don't fit a transcription.
const AI_MESSAGES: Partial<Record<AiErrorKind, string>> = {
  unsupported_input: "Gemini couldn't open this video.",
  blocked: "Gemini's safety filters blocked this video.",
};

/**
 * Asks Gemini to transcribe a public YouTube video from its URL. Never
 * throws: failures come back with a reason, a message for the user and a
 * detail for the server log.
 */
export async function transcribeWithGemini({
  youtubeId,
  durationSeconds,
}: {
  youtubeId: string;
  durationSeconds: number;
}): Promise<TranscribeResult> {
  let raw;
  try {
    const result = await generateText({
      model: chatModel(),
      instructions: TRANSCRIBE_INSTRUCTIONS,
      messages: [
        {
          role: "user",
          content: [
            // A URL object, not a string: a bare string would be read as base64 data.
            { type: "file", data: new URL(buildWatchUrl(youtubeId)), mediaType: "video/mp4" },
            { type: "text", text: transcribeRequest(durationSeconds) },
          ],
        },
      ],
      output: Output.object({ schema: transcriptSchema }),
      providerOptions: {
        // Only the audio matters, and low resolution cuts the video's tokens by
        // about two thirds. Temperature stays at the default: Google advises
        // against lowering it for Gemini 3, which can then loop.
        google: { mediaResolution: "MEDIA_RESOLUTION_LOW" } satisfies GoogleLanguageModelOptions,
      },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A blocked answer has no text, so reading `output` would only say it's missing.
    if (result.finishReason === "content-filter") {
      return failure("blocked", "Gemini stopped with finish reason content-filter.");
    }
    raw = result.output.segments;
  } catch (error) {
    return failure(failureReason(error), errorText(error));
  }

  const validated = validateGeminiSegments(raw, durationSeconds);
  if (!validated.ok) return failure(validated.reason, validated.detail);
  return { ok: true, source: "gemini", segments: validated.segments };
}

function failureReason(error: unknown): TranscribeFailureReason {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "timeout";
  }
  // Text that wasn't JSON or didn't match the schema. Cut off at the output
  // limit, the JSON is unfinished.
  if (NoObjectGeneratedError.isInstance(error)) {
    if (error.finishReason === "length") return "too_long";
    if (error.finishReason === "content-filter") return "blocked";
    return "invalid_output";
  }
  if (NoOutputGeneratedError.isInstance(error)) return "invalid_output";
  return classifyAiError(error).kind;
}

function failure(reason: TranscribeFailureReason, detail: string): TranscribeResult {
  const message = isAiErrorKind(reason)
    ? (AI_MESSAGES[reason] ?? aiErrorMessage(reason))
    : MESSAGES[reason];
  return { ok: false, reason, message, detail };
}

function isAiErrorKind(reason: TranscribeFailureReason): reason is AiErrorKind {
  return (AI_ERROR_KINDS as readonly string[]).includes(reason);
}

function errorText(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return `${error.name}: ${error.message} (finish reason ${error.finishReason})`;
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

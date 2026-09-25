// How /api/chat reports a failure, and how the chat turns any failure into
// something to show. Used on both sides, so nothing here is server-only.
import { APICallError, type FinishReason } from "ai";
import { readErrorBody, SERVER_PROBLEM, SERVER_UNREACHABLE, type ErrorBody } from "@/lib/errors";

/** The JSON body of an /api/chat error response. `error` is written for the user. */
export type ChatErrorBody = ErrorBody;

/** An /api/chat error response the chat shows as it is. */
export function chatErrorResponse(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ChatErrorBody, { status });
}

/**
 * What to tell the user about a failed chat request. Errors from the route
 * carry their message in a JSON body, and errors during the answer carry it
 * as the stream's error text; anything else gets a generic message.
 */
export function chatErrorMessage(error: Error): string {
  if (APICallError.isInstance(error)) {
    return parseErrorBody(error.responseBody) ?? SERVER_PROBLEM;
  }
  // fetch() rejects with a TypeError when the network is down.
  if (error instanceof TypeError) return SERVER_UNREACHABLE;
  return error.message || SERVER_PROBLEM;
}

/**
 * What to tell the user when Gemini ends an answer before it's done, by the
 * reason it gave. Such an answer isn't saved, like a failed one.
 */
export function unfinishedAnswerMessage(reason: FinishReason): string {
  switch (reason) {
    case "content-filter":
      return "Gemini's filters stopped this answer partway, as they do when it quotes well-known text such as song lyrics. Try again, or ask it to describe rather than quote.";
    case "length":
      return "The answer got too long and was cut off. Try asking for less at once.";
    default:
      return "Gemini stopped partway through the answer. Try again.";
  }
}

function parseErrorBody(body: string | undefined): string | null {
  if (!body) return null;
  try {
    return readErrorBody(JSON.parse(body));
  } catch {
    return null;
  }
}

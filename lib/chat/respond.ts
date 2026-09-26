import "server-only";
import {
  APICallError,
  createUIMessageStream,
  createUIMessageStreamResponse,
  RetryError,
  streamText,
  toUIMessageStream,
  type LanguageModel,
} from "ai";
import { after } from "next/server";
import { toModelMessages, trimHistory } from "@/lib/ai/context";
import { EmbeddingConfigError } from "@/lib/ai/embed";
import { AiConfigError, aiErrorText, classifyAiError } from "@/lib/ai/errors";
import { chatModel } from "@/lib/ai/models";
import { generalSystemPrompt, videoSystemPrompt } from "@/lib/ai/prompts/chat";
import { generateChatTitle } from "@/lib/ai/title";
import { chatErrorResponse } from "@/lib/chat/errors";
import { prepareLibraryAnswer } from "@/lib/chat/library";
import { NO_MATCH_REPLY, sourcesPart } from "@/lib/chat/sources";
import type { ChatMode, MessageRole } from "@/lib/chat/types";
import { CHAT_HISTORY_LIMIT } from "@/lib/constants";
import { getChat, setChatTitleIfEmpty, type NewChatValues } from "@/lib/db/queries/chats";
import { listMessages, saveExchange, type ExchangeMessage } from "@/lib/db/queries/messages";
import { getVideoById, getVideoByYoutubeId } from "@/lib/db/queries/videos";
import type { ChatWithVideo, MessageSources, VideoRow } from "@/lib/db/types";
import type { ChatRequest } from "@/lib/validation/chat";

/** Rewriting and searching get this long before a library question gives up. */
const LIBRARY_SEARCH_TIMEOUT_MS = 20_000;

/**
 * Answers one chat message from `owner` as a streamed UI message response,
 * or a JSON error the chat shows as it is. The question and answer are saved
 * together once the answer is complete, even if the browser has gone by then.
 * Nothing is saved when the answer fails, so the question can simply be sent
 * again.
 */
export async function respondToChat(request: ChatRequest, owner: string): Promise<Response> {
  const existing = await getChat(request.chatId);
  // Someone else's chat is as good as missing, but its ID can't start a new one.
  if (existing && existing.owner !== owner) {
    return chatErrorResponse("This chat doesn't exist.", 404);
  }
  // A saved chat keeps the mode and video it started with.
  const mode: ChatMode = existing?.mode ?? request.mode;
  const history = existing
    ? trimHistory(await listMessages(existing.id), CHAT_HISTORY_LIMIT)
    : [];
  const question = { id: request.message.id, content: request.message.text };

  const setup = await prepareMode(mode, existing, request.youtubeId, question.content, history);
  if (!setup.ok) return chatErrorResponse(setup.message, setup.status);

  const chat: NewChatValues = { id: request.chatId, mode, videoId: setup.videoId, owner };
  const answerId = crypto.randomUUID();

  // Started beside the answer rather than after it, so the chat list can
  // show the title as soon as the reply ends. It never fails.
  const title = existing?.title ? null : generateChatTitle(question.content);

  const save = async (answer: ExchangeMessage) => {
    await saveExchange(chat, question, answer);
    if (title) await setChatTitleIfEmpty(chat.id, await title);
  };

  if (setup.answer.kind === "fixed") {
    const { content, sources } = setup.answer;
    return fixedReply({ id: answerId, content, sources }, save);
  }
  const { instructions, sources } = setup.answer;

  let model: LanguageModel;
  try {
    model = chatModel();
  } catch (error) {
    // The API key or model name isn't set; the message says which.
    console.error("Chat model unavailable:", error);
    return chatErrorResponse(aiErrorText(classifyAiError(error)), 503);
  }

  let failed = false;
  const result = streamText({
    model,
    instructions,
    messages: [...toModelMessages(history), { role: "user", content: question.content }],
    onError: ({ error }) => {
      failed = true;
      console.error("Chat answer failed:", error);
    },
    // Runs before the response stream closes, so by the time the browser
    // sees the reply end, the exchange is saved.
    onEnd: async ({ text, finishReason, rawFinishReason }) => {
      if (failed) return;
      // Cut off partway, say by Gemini's recitation filter. The browser
      // treats it as failed too, from the same finish reason.
      if (finishReason !== "stop") {
        console.warn(`Chat answer ended early (${rawFinishReason ?? finishReason}), not saved.`);
        return;
      }
      if (!text.trim()) return;
      try {
        await save({ id: answerId, content: text, sources });
      } catch (error) {
        console.error("Saving the chat failed:", error);
      }
    },
  });

  // Reads the answer to the end even if the browser disconnects, so it's
  // still saved; after() keeps the function running until then.
  const finished = result.consumeStream();
  after(async () => {
    await finished;
  });

  const answer = toUIMessageStream({
    stream: result.stream,
    // The saved answer keeps the ID the browser was given.
    generateMessageId: () => answerId,
    // A library answer's start goes out with its sources, ahead of the text.
    sendStart: !sources,
    sendReasoning: false,
    onError: (error) => aiErrorText(classifyAiError(error)),
  });
  if (!sources) return createUIMessageStreamResponse({ stream: answer });

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: answerId });
        writer.write(sourcesPart(sources));
        writer.merge(answer);
      },
    }),
  });
}

type ModeAnswer =
  | {
      kind: "model";
      instructions: string;
      /** A library answer's videos, streamed ahead of it and saved with it. */
      sources?: MessageSources;
    }
  /** A reply given without asking Gemini: a library question that matched nothing. */
  | { kind: "fixed"; content: string; sources: MessageSources };

type ModeSetup =
  | { ok: true; videoId: string | null; answer: ModeAnswer }
  | { ok: false; status: number; message: string };

async function prepareMode(
  mode: ChatMode,
  existing: ChatWithVideo | null,
  youtubeId: string | undefined,
  question: string,
  history: readonly { role: MessageRole; content: string }[],
): Promise<ModeSetup> {
  switch (mode) {
    case "general":
      return { ok: true, videoId: null, answer: { kind: "model", instructions: generalSystemPrompt() } };
    case "library":
      return prepareLibrary(question, history);
    case "video": {
      const video = await loadChatVideo(existing, youtubeId);
      if (!video) {
        return { ok: false, status: 404, message: "This video isn't in the library anymore." };
      }
      if (video.status !== "ready" || !video.transcriptSegments) {
        return { ok: false, status: 409, message: "This video's transcript isn't ready yet." };
      }
      return {
        ok: true,
        videoId: video.id,
        answer: {
          kind: "model",
          instructions: videoSystemPrompt({
            title: video.title,
            channel: video.channel,
            durationSeconds: video.durationSeconds,
            segments: video.transcriptSegments,
            timestampsEstimated: video.timestampsEstimated,
          }),
        },
      };
    }
  }
}

/**
 * Searches the library for the question. With no good match the fixed reply
 * goes back without asking Gemini, so it can't fill the gap from general
 * knowledge.
 */
async function prepareLibrary(
  question: string,
  history: readonly { role: MessageRole; content: string }[],
): Promise<ModeSetup> {
  try {
    const setup = await prepareLibraryAnswer(question, history, {
      abortSignal: AbortSignal.timeout(LIBRARY_SEARCH_TIMEOUT_MS),
    });
    return {
      ok: true,
      videoId: null,
      answer:
        setup.kind === "no_match"
          ? { kind: "fixed", content: NO_MATCH_REPLY, sources: setup.sources }
          : { kind: "model", instructions: setup.instructions, sources: setup.sources },
    };
  } catch (error) {
    console.error("Library search failed:", error);
    if (error instanceof EmbeddingConfigError) return { ok: false, status: 503, message: error.message };
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, status: 504, message: "Searching your videos took too long. Try again." };
    }
    // Anything but a Gemini error, such as the database, is the route's 500.
    if (!(error instanceof AiConfigError || APICallError.isInstance(error) || RetryError.isInstance(error))) {
      throw error;
    }
    const classified = classifyAiError(error);
    const status =
      classified.kind === "rate_limited"
        ? 429
        : classified.kind === "bad_key" || classified.kind === "model_not_found"
          ? 503
          : 502;
    return { ok: false, status, message: aiErrorText(classified) };
  }
}

/**
 * Streams a reply that needs no model, and saves it with the question before
 * the stream ends, as a model's answer is.
 */
function fixedReply(
  answer: { id: string; content: string; sources: MessageSources },
  save: (answer: ExchangeMessage) => Promise<void>,
): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageId: answer.id });
      writer.write(sourcesPart(answer.sources));
      writer.write({ type: "text-start", id: "reply" });
      writer.write({ type: "text-delta", id: "reply", delta: answer.content });
      writer.write({ type: "text-end", id: "reply" });
      await save({ id: answer.id, content: answer.content, sources: answer.sources });
      writer.write({ type: "finish", finishReason: "stop" });
    },
    onError: (error) => {
      console.error("Saving the chat failed:", error);
      return "Couldn't save this chat. Try again.";
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function loadChatVideo(
  existing: ChatWithVideo | null,
  youtubeId: string | undefined,
): Promise<VideoRow | null> {
  if (existing) return existing.videoId ? getVideoById(existing.videoId) : Promise.resolve(null);
  return youtubeId ? getVideoByYoutubeId(youtubeId) : Promise.resolve(null);
}

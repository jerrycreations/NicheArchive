import "server-only";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type LanguageModel,
} from "ai";
import { after } from "next/server";
import { toModelMessages, trimHistory } from "@/lib/ai/context";
import { aiErrorText, classifyAiError } from "@/lib/ai/errors";
import { chatModel } from "@/lib/ai/models";
import { generalSystemPrompt, videoSystemPrompt } from "@/lib/ai/prompts/chat";
import { generateChatTitle } from "@/lib/ai/title";
import { chatErrorResponse } from "@/lib/chat/errors";
import { LIBRARY_CHAT_UNAVAILABLE } from "@/lib/chat/modes";
import type { ChatMode } from "@/lib/chat/types";
import { CHAT_HISTORY_LIMIT } from "@/lib/constants";
import { getChat, setChatTitleIfEmpty, type NewChatValues } from "@/lib/db/queries/chats";
import { listMessages, saveExchange } from "@/lib/db/queries/messages";
import { getVideoById, getVideoByYoutubeId } from "@/lib/db/queries/videos";
import type { ChatWithVideo, VideoRow } from "@/lib/db/types";
import type { ChatRequest } from "@/lib/validation/chat";

/**
 * Answers one chat message as a streamed UI message response, or a JSON
 * error the chat shows as it is. The question and answer are saved together
 * once the answer is complete, even if the browser has gone by then. Nothing
 * is saved when the answer fails, so the question can simply be sent again.
 */
export async function respondToChat(request: ChatRequest): Promise<Response> {
  const existing = await getChat(request.chatId);
  // A saved chat keeps the mode and video it started with.
  const mode: ChatMode = existing?.mode ?? request.mode;

  const setup = await prepareMode(mode, existing, request.youtubeId);
  if (!setup.ok) return chatErrorResponse(setup.message, setup.status);

  let model: LanguageModel;
  try {
    model = chatModel();
  } catch (error) {
    // The API key or model name isn't set; the message says which.
    console.error("Chat model unavailable:", error);
    return chatErrorResponse(aiErrorText(classifyAiError(error)), 503);
  }

  const history = existing
    ? trimHistory(await listMessages(existing.id), CHAT_HISTORY_LIMIT)
    : [];
  const chat: NewChatValues = { id: request.chatId, mode, videoId: setup.videoId };
  const question = { id: request.message.id, content: request.message.text };
  const answerId = crypto.randomUUID();

  // Started beside the answer rather than after it, so the chat list can
  // show the title as soon as the reply ends. It never fails.
  const title = existing?.title ? null : generateChatTitle(question.content);

  let failed = false;
  const result = streamText({
    model,
    instructions: setup.instructions,
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
        await saveExchange(chat, question, { id: answerId, content: text });
        if (title) await setChatTitleIfEmpty(chat.id, await title);
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

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // The saved answer keeps the ID the browser was given.
      generateMessageId: () => answerId,
      sendReasoning: false,
      onError: (error) => aiErrorText(classifyAiError(error)),
    }),
  });
}

type ModeSetup =
  | { ok: true; instructions: string; videoId: string | null }
  | { ok: false; status: number; message: string };

async function prepareMode(
  mode: ChatMode,
  existing: ChatWithVideo | null,
  youtubeId: string | undefined,
): Promise<ModeSetup> {
  switch (mode) {
    case "general":
      return { ok: true, instructions: generalSystemPrompt(), videoId: null };
    case "library":
      // Step 42 adds library search.
      return { ok: false, status: 501, message: LIBRARY_CHAT_UNAVAILABLE };
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
        instructions: videoSystemPrompt({
          title: video.title,
          channel: video.channel,
          durationSeconds: video.durationSeconds,
          segments: video.transcriptSegments,
          timestampsEstimated: video.timestampsEstimated,
        }),
      };
    }
  }
}

function loadChatVideo(
  existing: ChatWithVideo | null,
  youtubeId: string | undefined,
): Promise<VideoRow | null> {
  if (existing) return existing.videoId ? getVideoById(existing.videoId) : Promise.resolve(null);
  return youtubeId ? getVideoByYoutubeId(youtubeId) : Promise.resolve(null);
}

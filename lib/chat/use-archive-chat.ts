"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FinishReason, type UIMessage } from "ai";
import { useRef, useState } from "react";
import { chatErrorMessage, unfinishedAnswerMessage } from "@/lib/chat/errors";
import { messageText } from "@/lib/chat/messages";
import type { ChatMode } from "@/lib/chat/types";
import type { ChatRequest } from "@/lib/validation/chat";

const NO_ANSWER = "Gemini didn't answer that. Try asking another way.";

export type ArchiveChat = {
  /** The chat's ID. Made up in the browser for a chat that hasn't started yet. */
  id: string;
  messages: UIMessage[];
  /** Waiting for the answer to start. */
  waiting: boolean;
  /** Waiting for or reading an answer; nothing new can be sent. */
  busy: boolean;
  /** Why the last question failed, written for the user. */
  error: string | null;
  send(text: string): void;
  /** Sends the question that failed again. */
  retry(): void;
  stop(): void;
  dismissError(): void;
};

/**
 * useChat for this app's /api/chat. Each request carries only the chat, its
 * mode and video, and the new message; the server keeps the history.
 *
 * A question whose answer fails is taken back out of the chat, since the
 * server saved nothing, and `onFailed` gets its text so the composer can
 * offer it again.
 */
export function useArchiveChat({
  chatId,
  mode,
  youtubeId,
  initialMessages,
  onSent,
  onReplyFinished,
  onFailed,
}: {
  /** Omit for a new chat; one is made up. */
  chatId?: string;
  mode: ChatMode;
  youtubeId?: string;
  initialMessages?: UIMessage[];
  /** After a question is sent. `first` when it starts the chat. */
  onSent?: (event: { first: boolean }) => void;
  /** After an answer arrives in full. `first` when it's the chat's first. */
  onReplyFinished?: (event: { first: boolean }) => void;
  onFailed?: (text: string) => void;
}): ArchiveChat {
  const [error, setError] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  // useChat reports the error first and finishes after it.
  const failureRef = useRef<string | null>(null);

  const chat = useChat({
    id: chatId,
    messages: initialMessages,
    // Saved messages use UUIDs, and a question keeps the ID it was sent with.
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages }) => {
        const question = messages.at(-1)!;
        const body: ChatRequest = {
          chatId: id,
          mode,
          youtubeId,
          message: { id: question.id, text: messageText(question) },
        };
        return { body };
      },
    }),
    onError: (failure) => {
      failureRef.current = chatErrorMessage(failure);
    },
    onFinish: ({ message, messages, isAbort, isError, finishReason }) => {
      // Stopped on purpose: keep what arrived.
      if (isAbort) return;
      const failure = failureOf({ message, isError, finishReason, errorText: failureRef.current });
      failureRef.current = null;

      if (!failure) {
        onReplyFinished?.({ first: messages.length === 2 });
        return;
      }
      // Take the question, and any partial answer, back out.
      const questionIndex = messages.findLastIndex((item) => item.role === "user");
      const text = questionIndex === -1 ? "" : messageText(messages[questionIndex]);
      if (questionIndex !== -1) chat.setMessages(messages.slice(0, questionIndex));
      setError(failure);
      setFailedText(text);
      if (text) onFailed?.(text);
    },
  });

  const waiting = chat.status === "submitted";
  const busy = waiting || chat.status === "streaming";

  function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setFailedText(null);
    if (chat.error) chat.clearError();
    const first = chat.messages.length === 0;
    void chat.sendMessage({ text: question });
    onSent?.({ first });
  }

  return {
    id: chat.id,
    messages: chat.messages,
    waiting,
    busy,
    error,
    send,
    retry: () => {
      if (failedText) send(failedText);
    },
    stop: () => void chat.stop(),
    dismissError: () => setError(null),
  };
}

/**
 * Why an answer that ended didn't work, or null if it did: the request
 * failed, Gemini stopped partway (the server didn't save it either), or it
 * had no text.
 */
function failureOf({
  message,
  isError,
  finishReason,
  errorText,
}: {
  message: UIMessage;
  isError: boolean;
  finishReason: FinishReason | undefined;
  errorText: string | null;
}): string | null {
  if (isError) return errorText ?? NO_ANSWER;
  if (finishReason !== undefined && finishReason !== "stop") {
    return unfinishedAnswerMessage(finishReason);
  }
  return messageText(message).trim() ? null : NO_ANSWER;
}

import { describe, expect, it } from "vitest";
import { toUIMessages } from "@/lib/chat/messages";
import type { MessageSources, MessageSourceVideo } from "@/lib/db/types";
import {
  citedYoutubeIds,
  isNoMatchAnswer,
  libraryCitationHref,
  messageSources,
  NO_MATCH_REPLY,
  parseMessageSources,
} from "./sources";

const bread: MessageSourceVideo = {
  index: 1,
  youtubeId: "dQw4w9WgXcQ",
  title: "How Bread Rises",
  channel: "The Kitchen Lab",
  timestamps: [42, 130],
};
const pizza: MessageSourceVideo = {
  index: 2,
  youtubeId: "jNQXAC9IVRw",
  title: "Pizza Dough",
  channel: "Oven Club",
  timestamps: [5],
};

describe("libraryCitationHref", () => {
  const none = new Set<string>();

  it("sends [n @ m:ss] to video n's page at that second", () => {
    const href = libraryCitationHref([bread, pizza], none);
    expect(href({ seconds: 83.6, label: "1:23", source: 2 })).toBe("/videos/jNQXAC9IVRw?t=83");
    expect(href({ seconds: 42, label: "0:42", source: 1 })).toBe("/videos/dQw4w9WgXcQ?t=42");
  });

  it("leaves a citation of a video that isn't among the sources as text", () => {
    expect(libraryCitationHref([bread], none)({ seconds: 5, label: "0:05", source: 3 })).toBeNull();
  });

  it("sends a bare [m:ss] to the only video, and leaves it as text when there are several", () => {
    expect(libraryCitationHref([bread], none)({ seconds: 5, label: "0:05" })).toBe(
      "/videos/dQw4w9WgXcQ?t=5",
    );
    expect(libraryCitationHref([bread, pizza], none)({ seconds: 5, label: "0:05" })).toBeNull();
  });

  it("leaves citations of a deleted video as text", () => {
    const href = libraryCitationHref([bread, pizza], new Set(["dQw4w9WgXcQ"]));
    expect(href({ seconds: 42, label: "0:42", source: 1 })).toBeNull();
    expect(href({ seconds: 5, label: "0:05", source: 2 })).toBe("/videos/jNQXAC9IVRw?t=5");
  });
});

describe("citedYoutubeIds", () => {
  it("lists each cited video once, skipping messages without videos", () => {
    const videos: MessageSources = { kind: "videos", videos: [bread, pizza] };
    expect(
      citedYoutubeIds([
        { sources: null },
        { sources: videos },
        { sources: { kind: "no_match", question: "Why?" } },
        { sources: { kind: "videos", videos: [bread] } },
      ]),
    ).toEqual(["dQw4w9WgXcQ", "jNQXAC9IVRw"]);
  });
});

describe("parseMessageSources", () => {
  it("reads both kinds and rejects anything else", () => {
    expect(parseMessageSources({ kind: "videos", videos: [bread] })).toEqual({
      kind: "videos",
      videos: [bread],
    });
    expect(parseMessageSources({ kind: "no_match", question: "Why?" })).toEqual({
      kind: "no_match",
      question: "Why?",
    });
    expect(parseMessageSources({ kind: "videos", videos: [{ index: 1 }] })).toBeNull();
    expect(parseMessageSources(null)).toBeNull();
  });
});

describe("messageSources", () => {
  it("reads a saved library answer's sources back out of its UI message", () => {
    const sources: MessageSources = { kind: "videos", videos: [bread] };
    const [question, answer] = toUIMessages([
      { id: "q", role: "user", content: "Why does bread rise?", sources: null },
      { id: "a", role: "assistant", content: "Yeast [1 @ 0:42].", sources },
    ]);
    expect(messageSources(question)).toBeNull();
    expect(messageSources(answer)).toEqual(sources);
    expect(answer.parts.at(-1)).toEqual({ type: "text", text: "Yeast [1 @ 0:42]." });
  });
});

describe("isNoMatchAnswer", () => {
  it("recognizes the fixed reply at the start of an answer", () => {
    expect(isNoMatchAnswer(NO_MATCH_REPLY)).toBe(true);
    expect(isNoMatchAnswer(`\n${NO_MATCH_REPLY} The videos are about pizza.`)).toBe(true);
    expect(isNoMatchAnswer("Yeast eats sugar [1 @ 0:42].")).toBe(false);
    expect(isNoMatchAnswer("I couldn't")).toBe(false);
  });
});

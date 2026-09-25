import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPendingStart, takePendingStart } from "./pending-start";

const NOW = 1_790_000_000_000;

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pending chat start", () => {
  it("hands over a question once", () => {
    setPendingStart({ mode: "general", question: "What is RRF?" }, NOW);
    expect(takePendingStart(NOW + 500)).toEqual({ mode: "general", question: "What is RRF?" });
    expect(takePendingStart(NOW + 600)).toBeNull();
  });

  it("keeps the video of a video chat", () => {
    setPendingStart({ mode: "video", youtubeId: "dQw4w9WgXcQ", question: "Summarize" }, NOW);
    expect(takePendingStart(NOW)).toEqual({
      mode: "video",
      youtubeId: "dQw4w9WgXcQ",
      question: "Summarize",
    });
  });

  it("drops a question left more than a minute ago", () => {
    setPendingStart({ mode: "general", question: "Hi" }, NOW);
    expect(takePendingStart(NOW + 60_001)).toBeNull();
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown mode", JSON.stringify({ mode: "x", question: "Hi", savedAt: NOW })],
    ["an empty question", JSON.stringify({ mode: "general", question: " ", savedAt: NOW })],
    ["a video chat without a video", JSON.stringify({ mode: "video", question: "Hi", savedAt: NOW })],
  ])("ignores %s", (_, raw) => {
    sessionStorage.setItem("nichearchive:pending-chat-start", raw);
    expect(takePendingStart(NOW)).toBeNull();
    // Removed all the same, so it can't get in the way later.
    expect(sessionStorage.length).toBe(0);
  });

  it("does without storage that throws, as in some private windows", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(() => setPendingStart({ mode: "general", question: "Hi" }, NOW)).not.toThrow();
    expect(takePendingStart(NOW)).toBeNull();
  });
});

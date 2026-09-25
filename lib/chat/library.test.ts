import { beforeEach, describe, expect, it, vi } from "vitest";
import { rewriteQuery } from "@/lib/ai/rewrite";
import { listLibraryVideos, type LibraryVideo } from "@/lib/db/queries/videos";
import { hybridSearch } from "@/lib/search/hybrid";
import type { ChunkMatch } from "@/lib/search/types";
import { prepareLibraryAnswer } from "./library";

vi.mock("@/lib/ai/rewrite", () => ({ rewriteQuery: vi.fn() }));
vi.mock("@/lib/search/hybrid", () => ({ hybridSearch: vi.fn() }));
vi.mock("@/lib/db/queries/videos", () => ({ listLibraryVideos: vi.fn() }));

function libraryVideo(id: string, youtubeId: string, title: string): LibraryVideo {
  return {
    id,
    youtubeId,
    title,
    channel: `${title} channel`,
    durationSeconds: 300,
    timestampsEstimated: false,
    transcriptSegments: [{ start: 40, duration: 5, text: `${title} words.` }],
  };
}

const match = (videoId: string, score: number, startSeconds: number): ChunkMatch => ({
  chunkId: `${videoId}-${startSeconds}`,
  videoId,
  position: 0,
  startSeconds,
  endSeconds: startSeconds + 60,
  text: "…",
  similarity: 0.8,
  keywordRank: null,
  score,
});

const HISTORY = [
  { role: "user" as const, content: "Why does bread rise?" },
  { role: "assistant" as const, content: "Yeast [1 @ 0:42]." },
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(rewriteQuery).mockImplementation(async (question) => `standalone: ${question}`);
});

describe("prepareLibraryAnswer", () => {
  it("searches with the rewritten question and numbers the videos in search order", async () => {
    vi.mocked(hybridSearch).mockResolvedValue([
      match("pizza", 0.02, 100.7),
      match("bread", 0.03, 40.2),
    ]);
    vi.mocked(listLibraryVideos).mockResolvedValue([
      libraryVideo("bread", "dQw4w9WgXcQ", "Bread"),
      libraryVideo("pizza", "jNQXAC9IVRw", "Pizza"),
    ]);

    const setup = await prepareLibraryAnswer("How long?", HISTORY);

    expect(rewriteQuery).toHaveBeenCalledWith("How long?", HISTORY);
    expect(hybridSearch).toHaveBeenCalledWith("standalone: How long?", { abortSignal: undefined });
    if (setup.kind !== "videos") throw new Error("Expected videos");
    expect(setup.sources).toEqual({
      kind: "videos",
      videos: [
        { index: 1, youtubeId: "dQw4w9WgXcQ", title: "Bread", channel: "Bread channel", timestamps: [40] },
        { index: 2, youtubeId: "jNQXAC9IVRw", title: "Pizza", channel: "Pizza channel", timestamps: [100] },
      ],
    });
    expect(setup.instructions).toContain('<video number="1">\nTitle: Bread');
    expect(setup.instructions).toContain('<video number="2">\nTitle: Pizza');
    expect(setup.instructions).toContain("[1 @ 2:15]");
  });

  it("finds no match without loading any video", async () => {
    vi.mocked(hybridSearch).mockResolvedValue([{ ...match("bread", 0.03, 40), similarity: 0.2 }]);

    expect(await prepareLibraryAnswer("What is sourdough?", [])).toEqual({
      kind: "no_match",
      sources: { kind: "no_match", question: "What is sourdough?" },
    });
    expect(listLibraryVideos).not.toHaveBeenCalled();
  });

  it("skips a video deleted since the search and numbers the rest from 1", async () => {
    vi.mocked(hybridSearch).mockResolvedValue([match("gone", 0.05, 0), match("pizza", 0.02, 10)]);
    vi.mocked(listLibraryVideos).mockResolvedValue([libraryVideo("pizza", "jNQXAC9IVRw", "Pizza")]);

    const setup = await prepareLibraryAnswer("Pizza?", []);

    if (setup.kind !== "videos") throw new Error("Expected videos");
    expect(setup.sources.videos.map(({ index, title }) => [index, title])).toEqual([[1, "Pizza"]]);
  });

  it("finds no match when every chosen video is gone", async () => {
    vi.mocked(hybridSearch).mockResolvedValue([match("gone", 0.05, 0)]);
    vi.mocked(listLibraryVideos).mockResolvedValue([]);

    expect(await prepareLibraryAnswer("Pizza?", [])).toMatchObject({ kind: "no_match" });
  });
});

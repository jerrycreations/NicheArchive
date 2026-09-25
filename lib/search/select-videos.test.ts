import { describe, expect, it } from "vitest";
import { MIN_SEMANTIC_SIMILARITY } from "@/lib/constants";
import { selectVideos } from "./select-videos";
import type { ChunkMatch, SelectedVideo } from "./types";

let nextChunk = 0;

/** A hybrid search row: a strong semantic match unless told otherwise. */
function match(videoId: string, score: number, fields: Partial<ChunkMatch> = {}): ChunkMatch {
  const position = nextChunk++;
  return {
    chunkId: `chunk-${position}`,
    videoId,
    position,
    startSeconds: position * 60,
    endSeconds: position * 60 + 60,
    text: `Chunk ${position}`,
    similarity: 0.8,
    keywordRank: null,
    score,
    ...fields,
  };
}

function selected(outcome: ReturnType<typeof selectVideos>): SelectedVideo[] {
  if (outcome.kind !== "videos") throw new Error(`Expected videos, got ${outcome.kind}`);
  return outcome.videos;
}

describe("selectVideos", () => {
  it("finds no match in no rows", () => {
    expect(selectVideos([])).toEqual({ kind: "no_match" });
  });

  it("scores a video as its best chunk plus half the rest", () => {
    const [video] = selected(
      selectVideos([match("a", 0.03), match("a", 0.01), match("a", 0.01)]),
    );
    expect(video.videoId).toBe("a");
    expect(video.score).toBeCloseTo(0.03 + 0.5 * (0.01 + 0.01));
  });

  it("caps what other chunks add at the best chunk's score", () => {
    const loose = Array.from({ length: 10 }, () => match("a", 0.01));
    const [video] = selected(selectVideos(loose));
    expect(video.score).toBeCloseTo(0.02);
  });

  it("ranks one strong match above many loose ones", () => {
    const videos = selected(
      selectVideos([
        ...Array.from({ length: 10 }, () => match("loose", 0.012)),
        match("strong", 0.032),
      ]),
    );
    expect(videos.map((video) => video.videoId)).toEqual(["strong", "loose"]);
  });

  it("returns the top three videos, best first", () => {
    const videos = selected(
      selectVideos([
        match("d", 0.01),
        match("b", 0.03),
        match("a", 0.04),
        match("c", 0.02),
      ]),
    );
    expect(videos.map((video) => video.videoId)).toEqual(["a", "b", "c"]);
  });

  it("keeps each video's three best chunks, in the order they come in the video", () => {
    const [video] = selected(
      selectVideos([
        match("a", 0.01, { startSeconds: 30 }),
        match("a", 0.05, { startSeconds: 400 }),
        match("a", 0.04, { startSeconds: 120 }),
        match("a", 0.03, { startSeconds: 0 }),
      ]),
    );
    expect(video.matches.map((chunk) => chunk.startSeconds)).toEqual([0, 120, 400]);
  });

  it("drops a video matched only by meaning below the threshold", () => {
    const outcome = selectVideos([
      match("weak", 0.03, { similarity: MIN_SEMANTIC_SIMILARITY - 0.01 }),
      match("weak", 0.02, { similarity: 0.4 }),
    ]);
    expect(outcome).toEqual({ kind: "no_match" });
  });

  it("keeps a video right at the threshold", () => {
    const videos = selected(selectVideos([match("a", 0.02, { similarity: MIN_SEMANTIC_SIMILARITY })]));
    expect(videos).toHaveLength(1);
  });

  it("keeps a video matched only by keyword, however unlike the question it is", () => {
    const videos = selected(
      selectVideos([
        match("keyword", 0.02, { similarity: null, keywordRank: 0.1 }),
        match("unrelated", 0.03, { similarity: 0.3 }),
      ]),
    );
    expect(videos.map((video) => video.videoId)).toEqual(["keyword"]);
  });

  it("keeps a video when any of its chunks really matched", () => {
    const videos = selected(
      selectVideos([
        match("a", 0.03, { similarity: 0.5 }),
        match("a", 0.01, { similarity: 0.45, keywordRank: 0.2 }),
      ]),
    );
    expect(videos.map((video) => video.videoId)).toEqual(["a"]);
  });
});

import { MIN_SEMANTIC_SIMILARITY, TOP_VIDEOS } from "@/lib/constants";
import type { ChunkMatch, SearchOutcome, SelectedVideo } from "@/lib/search/types";

/** How much a video's other matched chunks add, relative to their own scores. */
const OTHER_CHUNKS_WEIGHT = 0.5;

/**
 * Other chunks can add at most this much of the best chunk's score, so a
 * long video with many loose matches can't outrank one strong match.
 */
const MAX_BONUS_RATIO = 1;

/** Matched timestamps kept for each video. */
const MATCHES_PER_VIDEO = 3;

/**
 * Picks the videos to answer a library question from. Groups hybrid search's
 * matches by video and scores each as its best chunk's score plus half the
 * sum of the rest, capped. A video only counts when one of its chunks really
 * matched: a keyword hit, or a similarity of at least MIN_SEMANTIC_SIMILARITY.
 * The fused scores alone can't tell, since they rank anything. Returns the
 * top TOP_VIDEOS, or `no_match` when none count.
 */
export function selectVideos(matches: readonly ChunkMatch[]): SearchOutcome {
  const byVideo = new Map<string, ChunkMatch[]>();
  for (const match of matches) {
    const group = byVideo.get(match.videoId);
    if (group) group.push(match);
    else byVideo.set(match.videoId, [match]);
  }

  const videos: SelectedVideo[] = [];
  for (const [videoId, group] of byVideo) {
    if (!group.some(isRealMatch)) continue;
    const ranked = group.toSorted((a, b) => b.score - a.score);
    const [best, ...others] = ranked;
    const bonus = OTHER_CHUNKS_WEIGHT * others.reduce((sum, match) => sum + match.score, 0);
    videos.push({
      videoId,
      score: best.score + Math.min(bonus, MAX_BONUS_RATIO * best.score),
      matches: ranked
        .slice(0, MATCHES_PER_VIDEO)
        .toSorted((a, b) => a.startSeconds - b.startSeconds),
    });
  }

  if (videos.length === 0) return { kind: "no_match" };
  return {
    kind: "videos",
    videos: videos.toSorted((a, b) => b.score - a.score).slice(0, TOP_VIDEOS),
  };
}

function isRealMatch(match: ChunkMatch): boolean {
  return (
    match.keywordRank !== null ||
    (match.similarity !== null && match.similarity >= MIN_SEMANTIC_SIMILARITY)
  );
}

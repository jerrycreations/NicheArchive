/** One transcript chunk that hybrid search matched, by meaning, by keyword or both. Times are in seconds. */
export type ChunkMatch = {
  chunkId: string;
  videoId: string;
  position: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  /** Cosine similarity to the question, 0 to 1; null when only the keywords matched. */
  similarity: number | null;
  /** Full-text rank; null when only the meaning matched. */
  keywordRank: number | null;
  /** Reciprocal Rank Fusion score. It only orders matches: it's never zero, even for unrelated questions. */
  score: number;
};

/** A video chosen to answer a library question. */
export type SelectedVideo = {
  videoId: string;
  score: number;
  /** Its best-scoring matched chunks, at most three, in the order they come in the video. */
  matches: ChunkMatch[];
};

export type SearchOutcome =
  | { kind: "videos"; videos: SelectedVideo[] }
  /** Nothing matched well enough to answer from. */
  | { kind: "no_match" };

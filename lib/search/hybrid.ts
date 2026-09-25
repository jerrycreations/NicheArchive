import "server-only";
import { sql } from "drizzle-orm";
import { embedQuery } from "@/lib/ai/embed";
import { MIN_SEMANTIC_SIMILARITY, RRF_K, SEARCH_MATCH_COUNT } from "@/lib/constants";
import { db } from "@/lib/db";
import type { ChunkMatch } from "@/lib/search/types";

type HybridSearchRow = {
  chunk_id: string;
  video_id: string;
  position: number;
  start_seconds: number;
  end_seconds: number;
  text: string;
  similarity: number | null;
  keyword_rank: number | null;
  score: number;
};

/**
 * Finds the transcript chunks that best answer a question, by meaning and by
 * keyword, through the hybrid_search SQL function. Throws when embedding the
 * question fails; classifyAiError reads why.
 */
export async function hybridSearch(
  queryText: string,
  { abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<ChunkMatch[]> {
  const embedding = await embedQuery(queryText, { abortSignal });
  // pgvector's text form. Qualified, so it doesn't depend on the search path.
  const vector = `[${embedding.join(",")}]`;
  const rows = await db().execute<HybridSearchRow>(sql`
    select * from hybrid_search(
      ${queryText},
      ${vector}::extensions.vector,
      ${SEARCH_MATCH_COUNT},
      rrf_k => ${RRF_K}
    )
  `);

  const matches = rows.map(
    (row): ChunkMatch => ({
      chunkId: row.chunk_id,
      videoId: row.video_id,
      position: row.position,
      startSeconds: row.start_seconds,
      endSeconds: row.end_seconds,
      text: row.text,
      similarity: row.similarity,
      keywordRank: row.keyword_rank,
      score: row.score,
    }),
  );
  if (process.env.NODE_ENV === "development") logForTuning(queryText, matches);
  return matches;
}

/** Shows how close the best match came, to help tune MIN_SEMANTIC_SIMILARITY. */
function logForTuning(queryText: string, matches: readonly ChunkMatch[]) {
  const similarities = matches.flatMap((match) => (match.similarity === null ? [] : [match.similarity]));
  const best = similarities.length > 0 ? Math.max(...similarities).toFixed(3) : "none";
  const keywordHits = matches.filter((match) => match.keywordRank !== null).length;
  console.info(
    `Library search ${JSON.stringify(queryText)}: best similarity ${best} (threshold ${MIN_SEMANTIC_SIMILARITY}), ${keywordHits} keyword hits in ${matches.length} matches`,
  );
}

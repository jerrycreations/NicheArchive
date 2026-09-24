-- Custom SQL migration file, put your code below! --
-- Library search: ranks transcript chunks by keyword and by meaning, then merges
-- the two lists with Reciprocal Rank Fusion. Based on Supabase's hybrid search
-- example. `score` only orders results, since RRF always yields a "top N" even
-- for unrelated questions. `similarity` (null when a chunk matched only by
-- keyword) and `keyword_rank` (null when it matched only by meaning) are what
-- decide whether anything really matched.
-- Pinning search_path makes `vector` and `<=>` resolve the same way for any
-- caller, and satisfies Supabase's mutable-search-path lint.
-- To change this function later, add a new migration with `create or replace`.
create or replace function hybrid_search(
  query_text text,
  query_embedding extensions.vector(768),
  match_count int,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (
  chunk_id uuid,
  video_id uuid,
  "position" int,
  start_seconds real,
  end_seconds real,
  text text,
  similarity float,
  keyword_rank float,
  score float
)
language sql
stable
set search_path = public, extensions
as $$
  with full_text as (
    select
      c.id,
      ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text)) as keyword_rank,
      row_number() over (
        order by ts_rank_cd(c.search_vector, websearch_to_tsquery('english', query_text)) desc
      ) as rank_ix
    from transcript_chunks c
    where c.search_vector @@ websearch_to_tsquery('english', query_text)
    order by rank_ix
    limit match_count * 2
  ),
  semantic as (
    select
      c.id,
      1 - (c.embedding <=> query_embedding) as similarity,
      row_number() over (order by c.embedding <=> query_embedding) as rank_ix
    from transcript_chunks c
    order by rank_ix
    limit match_count * 2
  )
  select
    c.id,
    c.video_id,
    c.position,
    c.start_seconds,
    c.end_seconds,
    c.text,
    semantic.similarity::float8,
    full_text.keyword_rank::float8,
    (
      coalesce(full_text_weight / (rrf_k + full_text.rank_ix), 0)
      + coalesce(semantic_weight / (rrf_k + semantic.rank_ix), 0)
    )::float8 as score
  from full_text
  full outer join semantic on full_text.id = semantic.id
  join transcript_chunks c on c.id = coalesce(full_text.id, semantic.id)
  order by score desc, semantic.similarity desc nulls last
  limit match_count;
$$;

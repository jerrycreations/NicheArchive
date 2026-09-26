import { aiErrorText, classifyAiError } from "@/lib/ai/errors";
import { embeddingModelId } from "@/lib/ai/models";
import { withSession } from "@/lib/auth/require-session";
import { listIndexCandidates } from "@/lib/db/queries/videos";
import type { IndexPendingResponse } from "@/lib/search/index-types";

export const dynamic = "force-dynamic";

/**
 * The ready videos for "Re-index all" to index, one ID each. `?all=1` lists
 * every ready video; otherwise only those never indexed, indexed with
 * another embedding model, or whose last try failed.
 */
export const GET = withSession(async (_session, request: Request) => {
  const all = new URL(request.url).searchParams.get("all") === "1";

  let model: string;
  try {
    model = embeddingModelId();
  } catch (error) {
    // GEMINI_EMBEDDING_MODEL isn't set; the message says so.
    return respond({ error: aiErrorText(classifyAiError(error)) }, 503);
  }

  try {
    return respond({ youtubeIds: await listIndexCandidates({ all, model }) }, 200);
  } catch (error) {
    console.error("GET /api/index/pending failed:", error);
    return respond({ error: "Couldn't list the videos to index. Try again." }, 500);
  }
});

function respond(body: IndexPendingResponse, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

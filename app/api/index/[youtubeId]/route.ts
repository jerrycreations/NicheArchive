import { getVideoByYoutubeId } from "@/lib/db/queries/videos";
import { isDatabaseUnreachable, serverErrorMessage } from "@/lib/errors";
import { indexVideo } from "@/lib/search/index-video";
import type { IndexResponse } from "@/lib/search/index-types";
import { youtubeIdSchema } from "@/lib/validation/video";

// Vercel Hobby's limit. indexVideo stops at 280 seconds to record a failure.
export const maxDuration = 300;

/**
 * Builds one video's library search index and waits for it, for the Retry
 * button and the "Re-index all" loop, which calls it one video at a time.
 * A 429 carries Google's suggested wait in `retryAfterSeconds` and the
 * Retry-After header.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/index/[youtubeId]">) {
  const { youtubeId } = await ctx.params;
  if (!youtubeIdSchema.safeParse(youtubeId).success) {
    return Response.json({ error: "That isn't a YouTube video ID." }, { status: 400 });
  }

  let video;
  try {
    video = await getVideoByYoutubeId(youtubeId);
  } catch (error) {
    console.error(`POST /api/index/${youtubeId} failed:`, error);
    const message = serverErrorMessage(error);
    const status = isDatabaseUnreachable(error) ? 503 : 500;
    return respond({ outcome: "failed", reason: "database", message }, status);
  }
  if (!video) return respond({ outcome: "not_found" }, 404);

  const result = await indexVideo(video.id);
  switch (result.kind) {
    case "indexed":
      return respond({ outcome: "indexed", chunkCount: result.chunkCount }, 200);
    case "not_ready":
      return respond({ outcome: "not_ready" }, 409);
    case "superseded":
      return respond({ outcome: "superseded" }, 409);
    case "failed": {
      const { failure } = result;
      if (failure.reason !== "rate_limited") return respond({ outcome: "failed", ...failure }, 500);
      const headers =
        failure.retryAfterSeconds === undefined
          ? undefined
          : { "Retry-After": String(failure.retryAfterSeconds) };
      return respond({ outcome: "failed", ...failure }, 429, headers);
    }
  }
}

function respond(body: IndexResponse, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

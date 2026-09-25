import { getVideoByYoutubeId } from "@/lib/db/queries/videos";
import { serverErrorResponse, type ErrorBody } from "@/lib/errors";
import { contentDisposition, exportFilename } from "@/lib/export/filenames";
import { formatTranscriptFile } from "@/lib/export/format";
import { youtubeIdSchema } from "@/lib/validation/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One video's transcript as a .txt download, in the same format and with the
 * same kind of name as the files in "Download all".
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/export/[youtubeId]">) {
  const { youtubeId } = await ctx.params;
  if (!youtubeIdSchema.safeParse(youtubeId).success) {
    return fail("That isn't a YouTube video ID.", 400);
  }

  let video;
  try {
    video = await getVideoByYoutubeId(youtubeId);
  } catch (error) {
    return serverErrorResponse(`GET /api/export/${youtubeId}`, error);
  }
  if (!video) return fail("This video isn't in the library anymore.", 404);
  if (video.status !== "ready" || !video.transcriptSegments) {
    return fail("This video's transcript isn't ready yet.", 409);
  }

  const text = formatTranscriptFile({ ...video, transcriptSegments: video.transcriptSegments });
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": contentDisposition(exportFilename(video)),
      "Cache-Control": "no-store",
    },
  });
}

function fail(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

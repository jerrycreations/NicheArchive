import { countNotReady, listExportVideos } from "@/lib/db/queries/videos";
import { serverErrorResponse } from "@/lib/errors";
import { exportFilenames } from "@/lib/export/filenames";
import { formatTranscriptFile, type ExportVideo } from "@/lib/export/format";
import type { ExportFile } from "@/lib/export/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every ready transcript as a .txt file, ordered by title, for "Download all".
 * The server names and formats the files; the browser only zips them.
 *
 * The body is streamed one file at a time: Vercel caps a function's response
 * at 4.5 MB unless it's streamed, and a few hundred transcripts can pass that.
 */
export async function GET() {
  let videos: ExportVideo[];
  let skipped: number;
  try {
    [videos, skipped] = await Promise.all([listExportVideos(), countNotReady()]);
  } catch (error) {
    return serverErrorResponse("GET /api/export", error);
  }

  const names = exportFilenames(videos);
  const encoder = new TextEncoder();
  let index = 0;

  // An ExportBundle (lib/export/types.ts), written out a file at a time as the
  // browser reads it.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"files":['));
    },
    pull(controller) {
      if (index < videos.length) {
        const file: ExportFile = { name: names[index], content: formatTranscriptFile(videos[index]) };
        controller.enqueue(encoder.encode((index > 0 ? "," : "") + JSON.stringify(file)));
        index++;
        return;
      }
      controller.enqueue(encoder.encode(`],"skipped":${skipped}}`));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

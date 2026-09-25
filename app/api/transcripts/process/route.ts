import { after } from "next/server";
import { claimForProcessing, getVideoByYoutubeId } from "@/lib/db/queries/videos";
import { serverErrorResponse } from "@/lib/errors";
import { processVideoTranscript } from "@/lib/transcript/pipeline";
import type { ProcessOutcome, ProcessResponse } from "@/lib/transcript/status";
import { processRequestSchema } from "@/lib/validation/transcript";

// The caption adapter needs Node.js.
export const runtime = "nodejs";

// Vercel Hobby's limit, which the after() work counts against: captions take
// up to 20 seconds and Gemini up to 240.
export const maxDuration = 300;

/**
 * Starts getting a saved video's transcript. The claim is taken before the
 * response, so a page refreshed right after shows the video as processing;
 * the work itself runs after the response. Calling again is harmless, since
 * only one run can hold the claim, and it's how Retry works.
 */
export async function POST(request: Request) {
  const parsed = processRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Send { "youtubeId": "<11-character video ID>" }.' },
      { status: 400 },
    );
  }

  try {
    const video = await getVideoByYoutubeId(parsed.data.youtubeId);
    if (!video) return respond("not_found", 404);
    if (video.status === "ready") return respond("ready", 200);

    const claimedAt = await claimForProcessing(video.id, new Date());
    if (!claimedAt) return respond("already_running", 202);

    after(() => processVideoTranscript(video, claimedAt));
    return respond("started", 202);
  } catch (error) {
    return serverErrorResponse("POST /api/transcripts/process", error);
  }
}

function respond(outcome: ProcessOutcome, status: number): Response {
  return Response.json({ outcome } satisfies ProcessResponse, { status });
}

import { listVideoStatuses } from "@/lib/db/queries/videos";
import { serverErrorResponse } from "@/lib/errors";
import type { TranscriptStatusInfo } from "@/lib/transcript/status";
import { MAX_STATUS_IDS, statusIdsSchema } from "@/lib/validation/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transcript states for `?ids=a,b,c`, for pages watching videos that are
 * still processing. Statuses are effective, so stalled processing reads as
 * failed. Videos that no longer exist are left out.
 */
export async function GET(request: Request) {
  const ids = statusIdsSchema.safeParse(new URL(request.url).searchParams.get("ids") ?? "");
  if (!ids.success) {
    return Response.json(
      { error: `Send ?ids= with 1 to ${MAX_STATUS_IDS} comma-separated YouTube video IDs.` },
      { status: 400 },
    );
  }

  let statuses: TranscriptStatusInfo[];
  try {
    statuses = await listVideoStatuses(ids.data);
  } catch (error) {
    return serverErrorResponse("GET /api/videos/status", error);
  }
  return Response.json(statuses, { headers: { "Cache-Control": "no-store" } });
}

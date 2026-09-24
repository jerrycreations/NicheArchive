// Throwaway caption spike (plan Step 5); Step 48 deletes it.
import { z } from "zod";
import {
  fetchCaptions,
  type CaptionFailureReason,
  type CaptionSource,
} from "@/lib/youtube/captions";
import { parseYouTubeUrl } from "@/lib/youtube/url";

export const runtime = "nodejs";

// Vercel Hobby's limit; 10 videos at the adapter's 20-second timeout fit inside it.
export const maxDuration = 300;

const MAX_URLS = 10;
const PREVIEW_CHARS = 200;

const bodySchema = z.object({
  urls: z.array(z.string()).min(1).max(MAX_URLS),
});

export type CaptionProbeRow = {
  input: string;
  youtubeId: string | null;
  ok: boolean;
  source: CaptionSource | null;
  segmentCount: number | null;
  preview: string | null;
  reason: CaptionFailureReason | "invalid_url" | null;
  detail: string | null;
  ms: number | null;
};

export type CaptionProbeResponse = {
  ranOn: string;
  region: string | null;
  rows: CaptionProbeRow[];
};

export async function POST(request: Request) {
  // No passcode protects this until Step 12, and Vercel's Deployment
  // Protection covers preview URLs but not the production domain.
  if (process.env.VERCEL_ENV === "production") {
    return Response.json(
      { error: "The caption spike is off in production. Use a preview deployment." },
      { status: 404 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: `Send { "urls": [...] } with 1 to ${MAX_URLS} URLs.` },
      { status: 400 },
    );
  }

  const rows: CaptionProbeRow[] = [];
  // One at a time, like the real pipeline, so timings aren't skewed.
  for (const input of parsed.data.urls) {
    rows.push(await probe(input));
  }

  return Response.json({
    ranOn: process.env.VERCEL_ENV ?? "local",
    region: process.env.VERCEL_REGION ?? null,
    rows,
  } satisfies CaptionProbeResponse);
}

async function probe(input: string): Promise<CaptionProbeRow> {
  const row: CaptionProbeRow = {
    input,
    youtubeId: null,
    ok: false,
    source: null,
    segmentCount: null,
    preview: null,
    reason: null,
    detail: null,
    ms: null,
  };

  const url = parseYouTubeUrl(input);
  if (!url.ok) return { ...row, reason: "invalid_url", detail: url.reason };

  const started = performance.now();
  const result = await fetchCaptions(url.id);
  const timed = {
    ...row,
    youtubeId: url.id,
    ms: Math.round(performance.now() - started),
  };

  if (!result.ok) {
    return { ...timed, reason: result.reason, detail: result.detail };
  }
  return {
    ...timed,
    ok: true,
    source: result.source,
    segmentCount: result.segments.length,
    preview: result.segments
      .map((segment) => segment.text)
      .join(" ")
      .slice(0, PREVIEW_CHARS),
  };
}

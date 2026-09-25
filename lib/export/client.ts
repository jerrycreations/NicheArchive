// Browser helpers for the export routes. They never throw: a failure comes
// back as `{ error }` with a message for the user.
import { readErrorBody, SERVER_PROBLEM, SERVER_UNREACHABLE } from "@/lib/errors";
import { filenameFromContentDisposition } from "@/lib/export/save-blob";
import type { ExportBundle } from "@/lib/export/types";

/** Every ready transcript, named and formatted, for "Download all". */
export async function fetchExportBundle(): Promise<ExportBundle | { error: string }> {
  let response: Response;
  try {
    response = await fetch("/api/export", { cache: "no-store" });
  } catch {
    return { error: SERVER_UNREACHABLE };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A body cut off partway, or a server error that isn't JSON.
    return { error: response.ok ? SERVER_UNREACHABLE : SERVER_PROBLEM };
  }
  if (!response.ok) return { error: readErrorBody(body) ?? SERVER_PROBLEM };
  return body as ExportBundle;
}

/** One video's .txt file and the name the server gave it. */
export async function fetchTranscriptFile(
  youtubeId: string,
): Promise<{ blob: Blob; filename: string } | { error: string }> {
  try {
    const response = await fetch(`/api/export/${encodeURIComponent(youtubeId)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      return { error: readErrorBody(body) ?? SERVER_PROBLEM };
    }
    const filename =
      filenameFromContentDisposition(response.headers.get("Content-Disposition")) ??
      `${youtubeId}.txt`;
    return { blob: await response.blob(), filename };
  } catch {
    return { error: SERVER_UNREACHABLE };
  }
}

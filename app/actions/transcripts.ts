"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { actionError, unexpectedError, type ActionError } from "@/lib/actions/result";
import { getSession } from "@/lib/auth/require-session";
import { getVideoByYoutubeId, writeTranscript } from "@/lib/db/queries/videos";
import { SIGNED_OUT } from "@/lib/errors";
import { videoPath } from "@/lib/navigation";
import { indexVideo } from "@/lib/search/index-video";
import { parsePastedTranscript, TRANSCRIPT_TOO_LONG } from "@/lib/transcript/parse-pasted";
import { segmentsToPlainText } from "@/lib/transcript/text";
import {
  pasteTranscriptInputSchema,
  type PasteTranscriptInput,
} from "@/lib/validation/transcript";

export type SavePastedTranscriptResult =
  | { kind: "saved" }
  | { kind: "invalid_transcript"; message: string }
  | ActionError;

/**
 * Saves a transcript the user copied from elsewhere and pasted in, and marks
 * the video ready. It replaces whatever the video had and ends any processing
 * still running for it, whose own result is then dropped. The library search
 * index is rebuilt after the response.
 */
export async function savePastedTranscript(
  input: PasteTranscriptInput,
): Promise<SavePastedTranscriptResult> {
  if (!(await getSession())) return actionError(SIGNED_OUT);
  const parsed = pasteTranscriptInputSchema.safeParse(input);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some(
      (issue) => issue.path[0] === "text" && issue.code === "too_big",
    );
    return tooLong
      ? { kind: "invalid_transcript", message: TRANSCRIPT_TOO_LONG }
      : actionError("That isn't a saved video.");
  }
  const { youtubeId, text } = parsed.data;

  try {
    const video = await getVideoByYoutubeId(youtubeId);
    if (!video) return actionError("This video isn't in the library anymore.");

    const transcript = parsePastedTranscript(text, video.durationSeconds);
    if (!transcript.ok) return { kind: "invalid_transcript", message: transcript.message };

    // Written without a claim, so it lands even while a run is processing.
    const saved = await writeTranscript(video.id, {
      segments: transcript.segments,
      text: segmentsToPlainText(transcript.segments),
      source: "pasted",
      timestampsEstimated: transcript.timestampsEstimated,
    });
    if (saved) after(() => indexVideo(video.id));
  } catch (error) {
    return unexpectedError("savePastedTranscript", error, "Couldn't save the transcript. Try again.");
  }

  revalidatePath("/library");
  revalidatePath(videoPath(youtubeId));
  return { kind: "saved" };
}

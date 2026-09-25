import type { TranscriptSource } from "@/lib/transcript/types";

const SOURCE_LABELS: Record<TranscriptSource, string> = {
  manual_captions: "From the video's captions",
  auto_captions: "From auto-generated captions",
  gemini: "Transcribed by Gemini",
  pasted: "Pasted manually",
};

/** Where a transcript came from, in words. */
export function SourceLabel({ source }: { source: TranscriptSource }) {
  return <p className="text-sm text-muted-foreground">{SOURCE_LABELS[source]}</p>;
}

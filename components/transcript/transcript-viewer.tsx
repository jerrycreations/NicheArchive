import { CopyTranscriptButton } from "@/components/transcript/copy-transcript-button";
import { SourceLabel } from "@/components/transcript/source-label";
import { TranscriptLine } from "@/components/transcript/transcript-line";
import { groupDisplayLines } from "@/lib/transcript/display-lines";
import type { TranscriptSegment, TranscriptSource } from "@/lib/transcript/types";

/**
 * A ready transcript: where it came from, a copy button and the lines, each
 * with a timestamp that plays the video from there. The list flows with the
 * page; the pinned player above it stays in view.
 */
export function TranscriptViewer({
  segments,
  text,
  source,
  timestampsEstimated,
}: {
  segments: readonly TranscriptSegment[];
  /** The plain text, without timestamps, that the copy button copies. */
  text: string;
  source: TranscriptSource | null;
  timestampsEstimated: boolean;
}) {
  const lines = groupDisplayLines(segments);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-medium">Transcript</h2>
          {source && <SourceLabel source={source} />}
        </div>
        {text && <CopyTranscriptButton text={text} />}
      </div>
      {timestampsEstimated && (
        <p className="text-sm text-muted-foreground">
          Timestamps are approximate because the pasted text had none.
        </p>
      )}
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">This transcript is empty.</p>
      ) : (
        <ol className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-3">
          {lines.map((line, index) => (
            <TranscriptLine
              key={index}
              start={line.start}
              text={line.text}
              estimated={timestampsEstimated}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

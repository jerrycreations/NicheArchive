"use client";

import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  savePastedTranscript,
  type SavePastedTranscriptResult,
} from "@/app/actions/transcripts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/actions/result";
import { MAX_PASTED_TRANSCRIPT_CHARS } from "@/lib/constants";
import { TRANSCRIPT_TOO_LONG } from "@/lib/transcript/parse-pasted";

/**
 * Where the user pastes a transcript copied by hand. Timestamps are optional;
 * without them the times are estimated. The text stays in the box when saving
 * fails, so it can be fixed and sent again.
 */
export function PasteTranscriptForm({ youtubeId }: { youtubeId: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();
  const errorId = useId();

  function fail(message: string) {
    setError(message);
    textareaRef.current?.focus();
  }

  function submit() {
    // Checked here too: a paste over Next's 1 MB action limit wouldn't reach the server.
    if (!text.trim()) return fail("Paste the transcript first.");
    if (text.length > MAX_PASTED_TRANSCRIPT_CHARS) return fail(TRANSCRIPT_TOO_LONG);

    startTransition(async () => {
      let result: SavePastedTranscriptResult;
      try {
        result = await savePastedTranscript({ youtubeId, text });
      } catch {
        result = actionError("Couldn't reach the server. Try again.");
      }

      // Updates after an await need their own transition to commit together
      // with `pending` turning false.
      startTransition(() => {
        // The action re-renders the page, which now shows the transcript.
        if (result.kind === "saved") toast.success("Transcript saved");
        else fail(result.message);
      });
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={textareaId} className="text-sm font-medium">
        Transcript
      </label>
      <Textarea
        ref={textareaRef}
        id={textareaId}
        name="transcript"
        rows={8}
        spellCheck={false}
        placeholder={"0:00 Paste the transcript here.\nTimestamps like 0:00 are optional."}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        readOnly={pending}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        className="max-h-96 min-h-40"
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save transcript"}
        </Button>
      </div>
    </form>
  );
}

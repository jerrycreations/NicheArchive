"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addVideo, type AddVideoResult } from "@/app/actions/videos";
import {
  AddVideoOutcome,
  isAddVideoProblem,
  type AddVideoOutcomeValue,
} from "@/components/library/add-video-outcome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionError } from "@/lib/actions/result";
import { videoPath } from "@/lib/navigation";
import { requestTranscript } from "@/lib/transcript/client";
import { parseYouTubeUrl } from "@/lib/youtube/url";

/**
 * Adds a video by its YouTube link, in the top bar's dialog and on the empty
 * library page. `onDone` runs when the form's job is over: after an add, or
 * when the user follows the link to a video that's already saved.
 */
export function AddVideoForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  // Controlled, so the link stays in the field after a failure.
  const [url, setUrl] = useState("");
  const [outcome, setOutcome] = useState<AddVideoOutcomeValue | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const messageId = useId();

  function submit(confirmLong: boolean) {
    // Checked here first for instant feedback; the server checks again.
    const parsed = parseYouTubeUrl(url);
    if (!parsed.ok) {
      setOutcome({ kind: "invalid_url", reason: parsed.reason });
      inputRef.current?.focus();
      return;
    }

    startTransition(async () => {
      let result: AddVideoResult;
      try {
        result = await addVideo({ url, confirmLong });
      } catch {
        // Thrown rather than returned, e.g. a dropped connection.
        result = actionError("Couldn't reach the server. Try again.");
      }

      // Start on the transcript without waiting. If this request is lost, the
      // library's status watcher starts it the next time the library is open.
      if (result.kind === "added") void requestTranscript(result.youtubeId);

      // Updates after an await need their own transition to commit together
      // with `pending` turning false. Otherwise the confirmation panel mounts
      // with its buttons still disabled, and Add anyway can't take focus.
      startTransition(() => {
        if (result.kind === "added") {
          const { youtubeId, title } = result;
          setUrl("");
          setOutcome(null);
          onDone?.();
          toast.success(`Added “${title}”`, {
            action: { label: "Open", onClick: () => router.push(videoPath(youtubeId)) },
          });
          return;
        }

        setOutcome(result);
        // The confirmation panel focuses its own button instead.
        if (result.kind !== "needs_confirmation") inputRef.current?.focus();
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        noValidate
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        {/* type="url" would refuse links without https:// and bare video IDs. */}
        <Input
          ref={inputRef}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a YouTube link"
          aria-label="YouTube link"
          aria-invalid={isAddVideoProblem(outcome) || undefined}
          aria-describedby={outcome ? messageId : undefined}
          readOnly={pending}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setOutcome(null);
          }}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
      {outcome && (
        <AddVideoOutcome
          id={messageId}
          outcome={outcome}
          pending={pending}
          onConfirm={() => submit(true)}
          onCancel={() => {
            setOutcome(null);
            inputRef.current?.focus();
          }}
          onNavigate={onDone}
        />
      )}
    </div>
  );
}

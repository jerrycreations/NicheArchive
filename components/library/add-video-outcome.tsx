"use client";

import Link from "next/link";
import type { AddVideoResult } from "@/app/actions/videos";
import { Button } from "@/components/ui/button";
import { videoPath } from "@/lib/navigation";
import { formatDurationWords } from "@/lib/time";
import { youTubeErrorMessage } from "@/lib/youtube/errors";
import { urlFailureMessage } from "@/lib/youtube/url";

/** Every addVideo result except success, which the form handles itself. */
export type AddVideoOutcomeValue = Exclude<AddVideoResult, { kind: "added" }>;

type AddVideoProblem = Exclude<
  AddVideoOutcomeValue,
  { kind: "already_exists" | "needs_confirmation" }
>;

/** Outcomes the user has to fix: shown in red, and they mark the field invalid. */
export function isAddVideoProblem(
  outcome: AddVideoOutcomeValue | null,
): outcome is AddVideoProblem {
  return (
    outcome !== null &&
    outcome.kind !== "already_exists" &&
    outcome.kind !== "needs_confirmation"
  );
}

export function AddVideoOutcome({
  id,
  outcome,
  pending,
  onConfirm,
  onCancel,
  onNavigate,
}: {
  /** The message's ID, so the URL field can point at it with aria-describedby. */
  id: string;
  outcome: AddVideoOutcomeValue;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNavigate?: () => void;
}) {
  if (outcome.kind === "already_exists") {
    return (
      <p id={id} role="status" className="text-sm text-muted-foreground">
        You already saved this video.{" "}
        <Link
          href={videoPath(outcome.youtubeId)}
          onClick={onNavigate}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Open it
        </Link>
      </p>
    );
  }

  if (outcome.kind === "needs_confirmation") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p id={id} className="text-sm">
          {`“${outcome.title}” is ${formatDurationWords(outcome.durationSeconds)} long. ` +
            "Long videos take longer to transcribe and use more of Gemini's free daily allowance. " +
            "Add it anyway?"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            autoFocus
            aria-describedby={id}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Adding…" : "Add anyway"}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {problemMessage(outcome)}
    </p>
  );
}

function problemMessage(outcome: AddVideoProblem): string {
  switch (outcome.kind) {
    case "invalid_url":
      return urlFailureMessage(outcome.reason);
    case "error":
      return outcome.message;
    default:
      return youTubeErrorMessage(outcome.kind);
  }
}

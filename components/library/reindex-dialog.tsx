"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  fetchIndexCandidates,
  runReindex,
  type ReindexProgress,
  type ReindexSummary,
} from "@/lib/search/reindex-client";

/**
 * Rebuilds the library search index one video at a time, from the browser:
 * free-tier embedding limits and function time limits rule out doing it all
 * in one request. Offers the videos that need it, or every video.
 */
export function ReindexDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes on close, since nothing in the dialog opened it. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const [running, setRunning] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Only Cancel stops a run, so a stray click or Escape can't.
        if (!running) onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!running}
        onCloseAutoFocus={(event) => {
          const target = returnFocusTo?.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Re-index library search</DialogTitle>
          <DialogDescription>
            {"Rebuilds the index that “All my videos” chats search, for example after the embedding model changes."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts fresh. */}
        <ReindexBody onRunningChange={setRunning} />
      </DialogContent>
    </Dialog>
  );
}

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "ready"; needed: string[]; all: string[] }
  | { name: "running"; progress: ReindexProgress }
  | { name: "finished"; summary: ReindexSummary };

function ReindexBody({ onRunningChange }: { onRunningChange: (running: boolean) => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [rebuildAll, setRebuildAll] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchIndexCandidates(false), fetchIndexCandidates(true)]).then(([needed, all]) => {
      if (ignore) return;
      if (!needed.ok) setPhase({ name: "error", message: needed.message });
      else if (!all.ok) setPhase({ name: "error", message: all.message });
      else setPhase({ name: "ready", needed: needed.youtubeIds, all: all.youtubeIds });
    });
    return () => {
      ignore = true;
    };
  }, []);

  // Stops a run if the dialog goes away some other way, such as leaving the page.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const running = phase.name === "running";
  useEffect(() => {
    if (!running) return;
    // Leaving or reloading the tab would stop the run, so the browser asks first.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  async function start(youtubeIds: string[]) {
    const controller = new AbortController();
    controllerRef.current = controller;
    onRunningChange(true);
    const summary = await runReindex(youtubeIds, {
      signal: controller.signal,
      onProgress: (progress) => setPhase({ name: "running", progress }),
    });
    controllerRef.current = null;
    onRunningChange(false);
    setPhase({ name: "finished", summary });
    // Video pages show a notice while their index has failed.
    router.refresh();
  }

  switch (phase.name) {
    case "loading":
      return (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          Checking which videos need indexing…
        </p>
      );

    case "error":
      return (
        <>
          <p role="alert" className="text-sm text-destructive">
            {phase.message}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </>
      );

    case "ready": {
      const chosen = rebuildAll ? phase.all : phase.needed;
      return (
        <>
          <div className="flex flex-col gap-4 text-sm">
            <p>
              {phase.all.length === 0
                ? "No video has a ready transcript to index yet."
                : phase.needed.length === 0
                  ? "Every video is indexed with the current embedding model."
                  : `${needIndexing(phase.needed.length, phase.all.length)}: never indexed, indexed with another embedding model, or failed last time.`}
            </p>
            {phase.all.length > 0 && (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="reindex-all"
                  checked={rebuildAll}
                  onCheckedChange={(checked) => setRebuildAll(checked === true)}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="reindex-all">Rebuild everything</Label>
                  <p className="text-muted-foreground">
                    Index all {countVideos(phase.all.length)} again, not just the ones that need it.
                  </p>
                </div>
              </div>
            )}
            {chosen.length > 0 && (
              <p className="text-muted-foreground">
                Gemini&apos;s free tier embeds only so much a minute, so this goes one video at a time
                and waits whenever it reaches the limit. Keep this tab open until it finishes.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button disabled={chosen.length === 0} onClick={() => start(chosen)}>
              {rebuildAll ? "Rebuild" : "Index"} {countVideos(chosen.length)}
            </Button>
          </DialogFooter>
        </>
      );
    }

    case "running": {
      const { done, total, failed, waitingSeconds } = phase.progress;
      return (
        <>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">
                {Math.min(done + 1, total)} of {total}
              </p>
              {failed > 0 && <p className="text-muted-foreground">{failed} failed</p>}
            </div>
            <Progress value={total === 0 ? 100 : (done / total) * 100} aria-label="Indexing progress" />
            <p role="status" className="text-muted-foreground">
              {waitingSeconds === undefined
                ? "Keep this tab open until it finishes."
                : `Gemini's free limit was reached. Going on in ${waitingSeconds} s…`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => controllerRef.current?.abort()}>
              Cancel
            </Button>
          </DialogFooter>
        </>
      );
    }

    case "finished":
      return (
        <>
          <p role="status" className="text-sm">
            {finishedMessage(phase.summary)}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        </>
      );
  }
}

function countVideos(count: number): string {
  return count === 1 ? "1 video" : `${count} videos`;
}

/** e.g. "All 3 videos need indexing" or "1 of 3 videos needs indexing". */
function needIndexing(needed: number, all: number): string {
  if (needed === all) return all === 1 ? "The video needs indexing" : `All ${all} videos need indexing`;
  return `${needed} of ${all} videos ${needed === 1 ? "needs" : "need"} indexing`;
}

function finishedMessage({ done, total, failed, cancelled, stoppedBecause }: ReindexSummary): string {
  const resume = "Run it again to pick up where it left off.";
  if (cancelled) return `Stopped after ${done} of ${total}. ${resume}`;
  if (stoppedBecause) return `Stopped after ${done} of ${total}: ${stoppedBecause} ${resume}`;
  if (failed === 0) return total === 1 ? "Indexed the video." : `Indexed all ${total} videos.`;
  return `Indexed ${total - failed} of ${total}. ${countVideos(failed)} couldn't be indexed; run it again to retry ${failed === 1 ? "it" : "them"}.`;
}

"use client";

import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildZip, EXPORT_ZIP_NAME } from "@/lib/export/build-zip";
import { fetchExportBundle } from "@/lib/export/client";
import { saveBlob } from "@/lib/export/save-blob";

type Phase = { kind: "idle" } | { kind: "fetching" } | { kind: "zipping"; percent: number };

/**
 * Downloads every ready transcript as `NicheArchive Transcripts.zip`, which
 * unzips to a folder of .txt files. The server formats and names the files;
 * the ZIP is built here in the browser.
 */
export function DownloadAllButton() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function download() {
    setPhase({ kind: "fetching" });
    try {
      const bundle = await fetchExportBundle();
      if ("error" in bundle) {
        toast.error(bundle.error);
        return;
      }
      if (bundle.files.length === 0) {
        toast.info("No transcripts to download yet.", {
          description: bundle.skipped > 0 ? skippedText(bundle.skipped) : undefined,
        });
        return;
      }

      setPhase({ kind: "zipping", percent: 0 });
      let shown = 0;
      const blob = await buildZip(bundle.files, (percent) => {
        // JSZip reports often; only whole-percent steps re-render.
        const whole = Math.floor(percent);
        if (whole === shown) return;
        shown = whole;
        setPhase({ kind: "zipping", percent: whole });
      });
      saveBlob(blob, EXPORT_ZIP_NAME);

      const count = bundle.files.length;
      toast.success(`Downloaded ${count === 1 ? "1 transcript" : `${count} transcripts`}`, {
        description: bundle.skipped > 0 ? skippedText(bundle.skipped) : undefined,
      });
    } catch (error) {
      console.error("Download all failed:", error);
      toast.error("Couldn't build the ZIP file. Try again.");
    } finally {
      setPhase({ kind: "idle" });
    }
  }

  const busy = phase.kind !== "idle";
  const label =
    phase.kind === "fetching"
      ? "Preparing…"
      : phase.kind === "zipping"
        ? `Zipping ${phase.percent}%`
        : "Download all";

  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={download}
      title="Download every transcript as a ZIP of .txt files"
    >
      {busy ? (
        <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      {/* Icon only on phones; the label still names the button. */}
      <span className="max-sm:sr-only tabular-nums">{label}</span>
    </Button>
  );
}

function skippedText(skipped: number): string {
  return `${skipped === 1 ? "1 video" : `${skipped} videos`} skipped: no transcript yet.`;
}

"use client";

// Throwaway caption spike (plan Step 5); Step 48 deletes it. The few classes
// here only undo Tailwind's reset so the textarea and table are visible.
import { useState } from "react";
import type { CaptionProbeResponse } from "@/app/api/dev/captions/route";

const MAX_URLS = 10;
const cell = "border px-2 py-1 align-top text-left";

export default function CaptionSpikePage() {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CaptionProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urls = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/dev/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(`${response.status}: ${body?.error ?? response.statusText}`);
      } else {
        setResult(body as CaptionProbeResponse);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  const succeeded = result?.rows.filter((row) => row.ok).length ?? 0;

  return (
    <main className="p-4 space-y-4">
      <h1>Caption spike</h1>
      <p>
        Paste up to {MAX_URLS} YouTube URLs, one per line. Record the results in
        docs/caption-spike.md.
      </p>
      <textarea
        className="block w-full max-w-3xl border p-2 font-mono text-sm"
        rows={10}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
      />
      <p>
        <button
          type="button"
          className="border px-3 py-1 disabled:opacity-50"
          onClick={run}
          disabled={running || urls.length === 0 || urls.length > MAX_URLS}
        >
          {running ? "Running…" : "Run"}
        </button>{" "}
        {urls.length} URL{urls.length === 1 ? "" : "s"}
        {urls.length > MAX_URLS && ` (at most ${MAX_URLS})`}
      </p>
      {error && <p role="alert">Request failed: {error}</p>}
      {result && (
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              {["#", "Input", "Video ID", "Result", "Source", "Segments", "ms", "Preview or detail"].map(
                (heading) => (
                  <th key={heading} className={cell}>
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={index}>
                <td className={cell}>{index + 1}</td>
                <td className={`${cell} max-w-64 break-all`}>{row.input}</td>
                <td className={`${cell} font-mono`}>{row.youtubeId ?? "—"}</td>
                <td className={cell}>{row.ok ? "ok" : row.reason}</td>
                <td className={cell}>{row.source ?? "—"}</td>
                <td className={cell}>{row.segmentCount ?? "—"}</td>
                <td className={cell}>{row.ms ?? "—"}</td>
                <td className={`${cell} max-w-xl`}>{row.ok ? row.preview : row.detail}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={cell} colSpan={8}>
                {succeeded} of {result.rows.length} returned captions · ran on{" "}
                {result.ranOn}
                {result.region && ` (${result.region})`}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </main>
  );
}

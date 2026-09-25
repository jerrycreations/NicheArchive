"use client";

import { usePlayer } from "@/lib/player/use-player";
import { formatTimestamp } from "@/lib/time";

/**
 * One line of the transcript. Its timestamp plays the video from there. The
 * list is a grid, and each line a subgrid of it, so every line's text starts
 * after the widest timestamp.
 */
export function TranscriptLine({
  start,
  text,
  estimated,
}: {
  start: number;
  text: string;
  /** The time is a guess, spread evenly over pasted text that had none. */
  estimated: boolean;
}) {
  const { seekTo } = usePlayer();
  const time = formatTimestamp(start);

  return (
    <li className="col-span-2 grid grid-cols-subgrid items-baseline">
      <button
        type="button"
        onClick={() => seekTo(start)}
        aria-label={estimated ? `Play from about ${time}` : `Play from ${time}`}
        className="-mx-1 justify-self-start rounded-sm px-1 py-0.5 font-mono text-xs text-muted-foreground tabular-nums underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {estimated && "~"}
        {time}
      </button>
      <p className="text-sm leading-6">{text}</p>
    </li>
  );
}

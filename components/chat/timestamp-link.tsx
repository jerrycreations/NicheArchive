"use client";

import Link from "next/link";
import { usePlayer } from "@/lib/player/use-player";
import { formatTimestamp } from "@/lib/time";

const CHIP =
  "rounded-sm bg-muted px-1 py-px font-mono text-[0.8125rem] text-foreground tabular-nums no-underline outline-none transition-colors hover:bg-accent-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A moment cited in an answer. On a video's page it plays the player from
 * there; anywhere else it opens the video's page at that time.
 *
 * Both are links to the moment, which keeps them inline with the text: a
 * button would let a line break between the chip and the punctuation after
 * it. A modified click still opens the link, e.g. in a new tab.
 */
export function TimestampLink({
  seconds,
  href,
  children,
}: {
  seconds: number;
  /** The video's page at this time. */
  href: string;
  children: React.ReactNode;
}) {
  const { available, seekTo } = usePlayer();
  const time = formatTimestamp(seconds);

  if (available) {
    return (
      <a
        href={href}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          seekTo(seconds);
        }}
        aria-label={`Play from ${time}`}
        className={CHIP}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={`Open the video at ${time}`} className={CHIP}>
      {children}
    </Link>
  );
}

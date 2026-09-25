"use client";

import { MessageSquarePlusIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { TimestampLink } from "@/components/chat/timestamp-link";
import { Button } from "@/components/ui/button";
import { carryNewChatFocus } from "@/lib/chat/composer-focus";
import type { MessageSourceVideo } from "@/lib/db/types";
import { videoPath } from "@/lib/navigation";
import { formatTimestamp } from "@/lib/time";
import { buildThumbnailUrl } from "@/lib/youtube/url";

/** Where "Continue with this video" goes: a new chat about it. */
export function continueChatPath(youtubeId: string): string {
  return `/chats?${new URLSearchParams({ mode: "video", video: youtubeId })}`;
}

/**
 * One video a library answer drew on: its number (the n in the answer's
 * [n @ m:ss] citations), thumbnail, title and channel, the matched moments,
 * and a way to keep asking about just this video. A video deleted since
 * shows muted, with nothing to open.
 */
export function SourceCard({ source, deleted }: { source: MessageSourceVideo; deleted: boolean }) {
  const href = videoPath(source.youtubeId);

  if (deleted) {
    return (
      <div className="flex w-64 shrink-0 gap-3 rounded-lg border border-dashed p-2.5 text-muted-foreground">
        <SourceNumber index={source.index} />
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <p className="font-medium">Video deleted</p>
          <p className="line-clamp-2 text-xs">{source.title}</p>
        </div>
      </div>
    );
  }

  return (
    <article className="flex w-64 shrink-0 flex-col gap-2.5 rounded-lg border p-2.5">
      <div className="flex gap-3">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md border bg-muted"
        >
          {/* YouTube already serves sized JPEGs, so Vercel's optimizer is skipped. */}
          <Image src={buildThumbnailUrl(source.youtubeId)} alt="" fill unoptimized sizes="96px" className="object-cover" />
          <span className="absolute top-1 left-1">
            <SourceNumber index={source.index} />
          </span>
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-medium">
            <Link href={href} className="underline-offset-4 hover:underline">
              <span className="sr-only">Video {source.index}: </span>
              {source.title}
            </Link>
          </h3>
          <p className="truncate text-xs text-muted-foreground">{source.channel}</p>
        </div>
      </div>
      {source.timestamps.length > 0 && (
        <ul aria-label="Matched moments" className="flex flex-wrap gap-1.5 text-sm">
          {source.timestamps.map((seconds) => (
            <li key={seconds}>
              <TimestampLink seconds={seconds} href={`${href}?t=${Math.floor(seconds)}`}>
                {formatTimestamp(seconds)}
              </TimestampLink>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="xs" asChild className="self-start">
        <Link href={continueChatPath(source.youtubeId)} onClick={() => carryNewChatFocus()}>
          <MessageSquarePlusIcon data-icon="inline-start" />
          Continue with this video
        </Link>
      </Button>
    </article>
  );
}

function SourceNumber({ index }: { index: number }) {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-background/90 text-xs font-medium tabular-nums ring-1 ring-border"
    >
      {index}
    </span>
  );
}

"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { VideoOption } from "@/lib/db/types";
import type { TranscriptStatus } from "@/lib/transcript/types";
import { buildThumbnailUrl } from "@/lib/youtube/url";

// Why a video can't be chosen yet.
const NOT_READY: Partial<Record<TranscriptStatus, string>> = {
  pending: "Getting the transcript…",
  failed: "No transcript yet",
};

/**
 * Picks the video a new chat is about, searching by title and channel.
 * Videos without a ready transcript are listed but can't be chosen.
 */
export function VideoPicker({
  videos,
  value,
  onChange,
}: {
  videos: VideoOption[];
  /** The chosen video's YouTube ID. */
  value: string | undefined;
  onChange: (youtubeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = videos.find((video) => video.youtubeId === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={selected ? `Video: ${selected.title}` : "Choose a video"}
          className="h-auto min-h-9 w-full justify-between gap-2 py-1.5 font-normal"
        >
          {selected ? (
            <VideoOptionLabel video={selected} />
          ) : (
            <span className="text-muted-foreground">Choose a video</span>
          )}
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandInput placeholder="Search by title or channel" />
          <CommandList>
            <CommandEmpty>
              {videos.length === 0 ? "No videos yet. Add one to the library first." : "No videos match."}
            </CommandEmpty>
            <CommandGroup>
              {videos.map((video) => (
                <CommandItem
                  key={video.id}
                  value={video.youtubeId}
                  keywords={[video.title, video.channel]}
                  disabled={video.status !== "ready"}
                  data-checked={video.youtubeId === value}
                  onSelect={() => {
                    onChange(video.youtubeId);
                    setOpen(false);
                  }}
                >
                  <VideoOptionLabel video={video} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VideoOptionLabel({ video }: { video: VideoOption }) {
  const note = NOT_READY[video.status];
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
      <span className="relative aspect-video w-12 shrink-0 overflow-hidden rounded-sm bg-muted">
        {/* YouTube already serves sized JPEGs, so Vercel's optimizer is skipped. */}
        <Image
          src={buildThumbnailUrl(video.youtubeId)}
          alt=""
          fill
          unoptimized
          sizes="48px"
          className="object-cover"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{video.title}</span>
        <span className="truncate text-xs text-muted-foreground">{note ?? video.channel}</span>
      </span>
    </span>
  );
}

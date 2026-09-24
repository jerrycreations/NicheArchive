import { VideoIcon } from "lucide-react";
import { AddVideoForm } from "@/components/library/add-video-form";

/** The library before the first video, with the add form right there. */
export function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed px-4 py-16 text-center sm:px-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <VideoIcon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">No videos yet</h2>
        <p className="text-sm text-muted-foreground">
          Paste a YouTube link to save the video and its transcript.
        </p>
      </div>
      <div className="w-full max-w-md text-left">
        <AddVideoForm />
      </div>
    </div>
  );
}

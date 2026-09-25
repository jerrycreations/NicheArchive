import { TranscriptSkeleton } from "@/components/transcript/transcript-processing";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// One tree for every screen size, so nothing renders twice. On phones it's a
// single column: the player, the tabs, then whichever panel is chosen. From
// `lg`, the player sits over the transcript on the left and the chat fills
// the right. The second row is flexible, so a chat taller than the player and
// transcript together adds space below the transcript, not under the player.
const GRID =
  "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr] lg:gap-x-6";

// Pinned under the 3.5rem top bar, so timestamps far down the transcript
// still play in view. The grid is the sticky element's containing block, so
// it stays pinned on phones while the Chat tab shows too. The opaque
// background hides the transcript scrolling under it.
const PLAYER_SLOT = "sticky top-14 z-10 bg-background pt-2 pb-3 lg:col-start-1 lg:row-start-1";

// Never taller than about 55% of the screen, so the transcript keeps room.
const PLAYER_BOX = "w-full max-w-[calc(55dvh*16/9)]";

// Pinned beside the player, its top level with the player's (the slot's
// `pt-2`) whether or not the page has scrolled. It ends 2rem above the bottom
// of the screen, where the page's bottom padding ends the grid, so reaching
// the end of the page doesn't push it up.
const CHAT_SLOT =
  "lg:sticky lg:top-16 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-2 lg:h-[calc(100dvh-6rem)]";

// Both panels stay mounted, so switching tabs on a phone never resets the chat.
// From `lg` there are no tabs, and both panels show.
const PANEL = "text-base max-lg:data-[state=inactive]:hidden";

/** The video page below its header: player, transcript and chat. */
export function VideoPageLayout({
  player,
  transcript,
}: {
  player: React.ReactNode;
  transcript: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="transcript" className={GRID}>
      <div className={PLAYER_SLOT}>
        <div className={PLAYER_BOX}>{player}</div>
      </div>
      <TabsList className="w-full lg:hidden">
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
        <TabsTrigger value="chat">Chat</TabsTrigger>
      </TabsList>
      {/* No tab stop on the panels themselves: they hold buttons and fields of their own. */}
      <TabsContent
        value="transcript"
        forceMount
        tabIndex={-1}
        className={cn(PANEL, "min-w-0 lg:col-start-1 lg:row-start-2")}
      >
        {transcript}
      </TabsContent>
      <TabsContent value="chat" forceMount tabIndex={-1} className={cn(PANEL, CHAT_SLOT)}>
        <ChatPlaceholder />
      </TabsContent>
    </Tabs>
  );
}

// Step 32 puts the video's chat here.
function ChatPlaceholder() {
  return (
    <section className="flex h-full min-h-64 flex-col gap-1 rounded-lg border p-4">
      <h2 className="font-medium">Chat</h2>
      <p className="text-sm text-muted-foreground">Questions about this video will appear here.</p>
    </section>
  );
}

/** The layout while the page loads, shaped like the real one so nothing jumps. */
export function VideoPageSkeleton() {
  return (
    <div className={GRID} aria-hidden>
      <div className={PLAYER_SLOT}>
        <Skeleton className={cn(PLAYER_BOX, "aspect-video rounded-lg")} />
      </div>
      <Skeleton className="h-8 w-full rounded-lg lg:hidden" />
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-44" />
        </div>
        <TranscriptSkeleton />
      </div>
      <Skeleton className={cn("hidden rounded-lg lg:block", CHAT_SLOT)} />
    </div>
  );
}

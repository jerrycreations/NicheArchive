import { MessagesSquareIcon } from "lucide-react";

/** The chat list before any chat is saved. */
export function EmptyChats() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <MessagesSquareIcon aria-hidden className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">No chats yet</p>
      <p className="text-sm text-muted-foreground">
        Chats you start here or on a video&apos;s page are saved in this list.
      </p>
    </div>
  );
}

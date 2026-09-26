import { connection } from "next/server";
import { Suspense } from "react";
import { ChatList, ChatListSkeleton } from "@/components/chats/chat-list";
import { ChatListDrawer } from "@/components/chats/chat-list-drawer";
import { DatabaseUnavailable } from "@/components/common/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { pageSession } from "@/lib/auth/require-session";
import { listChats } from "@/lib/db/queries/chats";
import { unlessDatabaseDown } from "@/lib/errors";

// The section fills the screen below the top bar (3.5rem and its 1px
// border) and the page's padding (4rem), so a chat's messages scroll inside
// it and its composer stays in view. From `lg` the list is a column on the
// left; below that it's a drawer, opened from a row above the chat.
const GRID =
  "grid h-[calc(100dvh-7.5rem-1px)] min-h-[28rem] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[18rem_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-6";

const LIST_COLUMN = "hidden min-h-0 lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col";

/** The Chats section: the chat list beside the open chat or a new one. */
export default function ChatsLayout({ children }: LayoutProps<"/chats">) {
  return (
    <div className={GRID}>
      {/* The list streams in, so opening a chat doesn't wait for it. */}
      <Suspense fallback={<ChatsNavSkeleton />}>
        <ChatsNav />
      </Suspense>
      <div className="min-h-0 min-w-0 lg:col-start-2 lg:row-start-1">{children}</div>
    </div>
  );
}

async function ChatsNav() {
  // Database reads don't make a page dynamic on their own (see the library page).
  await connection();
  const { person } = await pageSession();
  const loaded = await unlessDatabaseDown(() => listChats(person));
  // The open chat or new chat beside it says the same, so on phones the
  // drawer's row stays empty rather than repeating it.
  if (!loaded.ok) {
    return (
      <nav aria-label="Chats" className={LIST_COLUMN}>
        <DatabaseUnavailable heading="h2" compact />
      </nav>
    );
  }
  const chats = loaded.value;
  const now = new Date();

  return (
    <>
      <div className="lg:hidden">
        <ChatListDrawer chats={chats} now={now} />
      </div>
      <nav aria-label="Chats" className={LIST_COLUMN}>
        <ChatList chats={chats} now={now} className="h-full" />
      </nav>
    </>
  );
}

function ChatsNavSkeleton() {
  return (
    <>
      {/* The drawer's "All chats" button. */}
      <Skeleton className="h-7 w-28 lg:hidden" />
      <div className={LIST_COLUMN}>
        <ChatListSkeleton />
      </div>
    </>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Streamed after loading.tsx, so the response is a 200 rather than a 404.
// The site is kept out of search engines anyway.
export default function ChatNotFound() {
  return (
    <div className="flex h-full flex-col items-start gap-4 rounded-lg border p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Chat not found</h1>
        <p className="text-muted-foreground">It was deleted, or the link is wrong.</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/chats">Start a new chat</Link>
      </Button>
    </div>
  );
}

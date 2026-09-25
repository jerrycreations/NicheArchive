import Link from "next/link";
import { Button } from "@/components/ui/button";

// Streamed after loading.tsx, so the response is a 200 rather than a 404.
// The site is kept out of search engines anyway.
export default function VideoNotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Video not found</h1>
        <p className="text-muted-foreground">It isn&apos;t in the library, or it was deleted.</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/library">Back to the library</Link>
      </Button>
    </div>
  );
}

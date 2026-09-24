import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Library",
};

// Placeholder until Step 17 builds the video grid.
export default function LibraryPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      <p className="text-muted-foreground">Your saved videos will appear here.</p>
    </div>
  );
}

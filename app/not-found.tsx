import type { Metadata } from "next";
import Link from "next/link";
import { AddVideoDialogProvider } from "@/components/layout/add-video-dialog";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/require-session";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Any address the app doesn't have. It sits outside the app's route group,
 * so it brings the top bar itself and looks like every other page.
 */
export default async function NotFound() {
  // The proxy only lets signed-in devices this far, apart from /unlock itself.
  const session = await getSession();
  return (
    <AddVideoDialogProvider>
      <TopBar person={session?.person} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
            <p className="text-muted-foreground">
              There&apos;s nothing at this address. The link may be mistyped or out of date.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/library">Back to the library</Link>
          </Button>
        </div>
      </main>
    </AddVideoDialogProvider>
  );
}

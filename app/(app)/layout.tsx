import { AddVideoDialogProvider } from "@/components/layout/add-video-dialog";
import { TopBar } from "@/components/layout/top-bar";
import { pageSession } from "@/lib/auth/require-session";

/** The shell for every signed-in page: top bar and a centered content area. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { person } = await pageSession();
  return (
    <AddVideoDialogProvider>
      <TopBar person={person} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </AddVideoDialogProvider>
  );
}

import { AddVideoDialogProvider } from "@/components/layout/add-video-dialog";
import { TopBar } from "@/components/layout/top-bar";

/** The shell for every app page: top bar and a centered content area. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AddVideoDialogProvider>
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </AddVideoDialogProvider>
  );
}

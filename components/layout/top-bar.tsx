import Link from "next/link";
import { AddVideoButton } from "@/components/layout/add-video-dialog";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      {/* Tighter gaps below `sm` keep the full name on 320px phones. */}
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-1 px-4 sm:gap-2 sm:px-6 lg:px-8">
        <MobileNav />
        <Link href="/library" className="min-w-0 truncate font-semibold md:mr-4">
          NicheArchive
        </Link>
        <NavLinks />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <AddVideoButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { isActivePath, NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Library and Chats links from `md` up; below that they live in `MobileNav`. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map(({ href, label }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              active ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

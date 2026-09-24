"use client";

import { CheckIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isActivePath, NAV_ITEMS } from "@/lib/navigation";

/** Below `md`, the Library and Chats links move into this small menu. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActivePath(pathname, href);
          return (
            <DropdownMenuItem key={href} asChild>
              <Link href={href} aria-current={active ? "page" : undefined}>
                {label}
                {active && <CheckIcon className="ml-auto" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

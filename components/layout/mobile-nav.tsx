"use client";

import { CheckIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenuItems } from "@/components/layout/account-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isActivePath, NAV_ITEMS } from "@/lib/navigation";

/**
 * Below `md`, the Library and Chats links move into this small menu, with
 * who is signed in and Sign out under them.
 */
export function MobileNav({ person }: { person?: string }) {
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
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
        {person && (
          <>
            <DropdownMenuSeparator />
            <AccountMenuItems person={person} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

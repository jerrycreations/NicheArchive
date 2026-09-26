"use client";

import { LogOutIcon, UserRoundIcon } from "lucide-react";
import { useTransition } from "react";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * From `md`, who is signed in on this device, and a way out, say on a shared
 * computer. Below that, the same items sit in MobileNav, so the top bar keeps
 * the full name on 320px phones.
 */
export function AccountMenu({ person }: { person: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="hidden md:inline-flex">
          <UserRoundIcon />
          <span className="sr-only">{`Signed in as ${person}`}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <AccountMenuItems person={person} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Signed in as …" and Sign out, for a dropdown menu's content. */
export function AccountMenuItems({ person }: { person: string }) {
  const [signingOut, startTransition] = useTransition();

  return (
    <>
      <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
        {`Signed in as ${person}`}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={signingOut} onSelect={() => startTransition(() => signOut())}>
        <LogOutIcon />
        Sign out
      </DropdownMenuItem>
    </>
  );
}

"use client";

import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  label: string;
  email: string;
  isAdmin: boolean;
}

export function UserMenu({ label, email, isAdmin }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Helle Schrift: der Auslöser sitzt in der dunklen Kopfleiste. */}
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 gap-1 text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground"
        >
          {/* Das Zeichen steht immer, die Beschriftung erst ab xl: ein langer
              Firmenname oder eine lange E-Mail schob die Kopfleiste sonst über
              den Fensterrand hinaus. Wer der Angemeldete ist, steht im Menü. */}
          <UserRound className="size-4 shrink-0" aria-hidden />
          <span className="hidden max-w-40 truncate xl:inline">{label}</span>
          <span className="sr-only xl:hidden">Angemeldet als {label}</span>
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/orders">Bestellungen</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account">Konto</Link>
        </DropdownMenuItem>

        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">Verwaltung</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/kasse">Kasse &amp; Buchhaltung</Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/* Logout muss POST sein, damit kein Prefetch die Session beendet */}
          <form action={signOut}>
            <button type="submit" className="w-full text-left">
              Abmelden
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

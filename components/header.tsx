import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Basis-Header aus Phase 0. Noch ohne Session: Nav-Links und User-Menü
 * kommen in Phase 2, sobald Supabase Auth angebunden ist.
 */
export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          LIDER <span className="font-normal text-muted-foreground">Großhandel</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Anmelden</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

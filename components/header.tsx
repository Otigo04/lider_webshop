import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CartLink } from "@/components/cart-link";
import { MobileNav, type NavLink } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";

export async function Header() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  const links: NavLink[] = user
    ? [
        { href: "/shop", label: "Sortiment" },
        { href: "/orders", label: "Bestellungen" },
        ...(isAdmin ? [{ href: "/admin", label: "Verwaltung" }] : []),
      ]
    : [];

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href={user ? "/shop" : "/"}
          className="shrink-0 text-lg font-semibold tracking-tight"
        >
          LIDER{" "}
          <span className="font-normal text-muted-foreground">Berlin</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          {user ? <CartLink /> : null}
          {user ? (
            <UserMenu
              label={user.company_name || user.full_name || user.email}
              email={user.email}
              isAdmin={isAdmin}
            />
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Anmelden</Link>
            </Button>
          )}
          <div className="md:hidden">
            <MobileNav links={links} />
          </div>
        </div>
      </div>
    </header>
  );
}

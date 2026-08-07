import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getLogoPath } from "@/lib/logo";
import { CartLink } from "@/components/cart-link";
import { MobileNav, type NavLink } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";

export async function Header() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  const logoPath = getLogoPath();

  // /shop und die Flag-Filter sind auch ohne Login sichtbar (Schaufenster
  // ohne Preise), deshalb unabhängig vom Login-Status.
  const links: NavLink[] = [
    { href: "/shop", label: "Sortiment" },
    { href: "/shop/neuheiten", label: "Neuheiten" },
    { href: "/shop/topseller", label: "Topseller" },
    ...(user ? [{ href: "/orders", label: "Bestellungen" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Verwaltung" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-surface-dark-border bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 leading-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        >
          {logoPath ? (
            <span className="relative block h-8 w-8 shrink-0">
              <Image
                src={logoPath}
                alt="LIDER Großhandel"
                fill
                sizes="32px"
                className="object-contain"
              />
            </span>
          ) : null}
          <span className="block text-base font-semibold tracking-[0.14em]">
            LIDER BERLIN
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {/* Unterstrich läuft beim Überfahren von links ein – zeigt das Ziel
              an, ohne die Zeile beim Umschalten springen zu lassen. */}
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group relative py-1 text-surface-dark-muted transition-colors hover:text-surface-dark-foreground"
            >
              {link.label}
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100"
              />
            </Link>
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
            <Link
              href="/login"
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
            >
              Anmelden
            </Link>
          )}
          <div className="md:hidden">
            <MobileNav links={links} angemeldet={Boolean(user)} />
          </div>
        </div>
      </div>
    </header>
  );
}

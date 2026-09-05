import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getLogoMarkPath, getLogoWordmarkPath, LOGO_WORDMARK_ASPECT } from "@/lib/logo";
import { CartLink } from "@/components/cart-link";
import { MainNav } from "@/components/main-nav";
import { MobileNav, type NavLink } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";

export async function Header() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";
  const logoPath = getLogoMarkPath();
  const wordmarkPath = getLogoWordmarkPath();

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
    <header className="sticky top-0 z-40 bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 leading-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          {logoPath ? (
            <span className="relative block size-10 shrink-0">
              <Image
                src={logoPath}
                alt="LIDER Großhandel"
                fill
                sizes="40px"
                priority
                className="object-contain"
              />
            </span>
          ) : null}
          {wordmarkPath ? (
            <span
              className="relative block h-10"
              style={{ width: `calc(2.5rem * ${LOGO_WORDMARK_ASPECT})` }}
            >
              <Image
                src={wordmarkPath}
                alt="LIDER"
                fill
                sizes="200px"
                priority
                className="object-contain object-left"
              />
            </span>
          ) : (
            <span className="text-base font-bold leading-tight tracking-[0.16em]">
              LIDER
            </span>
          )}
        </Link>

        <MainNav links={links} />

        <div className="flex items-center gap-1">
          {user ? <CartLink /> : null}
          {user ? (
            <UserMenu
              label={user.company_name || user.full_name || user.email}
              email={user.email}
              isAdmin={isAdmin}
            />
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link
                href="/register"
                className="rounded-md border border-surface-dark-border px-3 py-1.5 text-sm font-medium text-surface-dark-foreground transition-colors hover:bg-white/10"
              >
                Registrieren
              </Link>
              <Link
                href="/login"
                className="rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-gold-foreground transition-colors hover:bg-gold/85"
              >
                Anmelden
              </Link>
            </div>
          )}
          <div className="md:hidden">
            <MobileNav links={links} angemeldet={Boolean(user)} logoSrc={logoPath} />
          </div>
        </div>
      </div>

      {/* Goldene Kante statt grauer Trennlinie – greift den Lorbeer des
          Wappens auf und trennt die Leiste deutlich vom Inhalt. */}
      <div aria-hidden className="h-0.5 bg-gold" />
    </header>
  );
}

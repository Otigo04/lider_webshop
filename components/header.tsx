import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getLogoMarkPath, getLogoWordmarkPath, LOGO_WORDMARK_ASPECT } from "@/lib/logo";
import { CartLink } from "@/components/cart-link";
import { MainNav } from "@/components/main-nav";
import { MerklisteLink } from "@/components/merkliste-link";
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
    { href: "/shop/reduziert", label: "Reduziert", erstAbXl: isAdmin },
    // Für Admins erst ab xl: zwischen 1024 und 1280 px passen Logo, sieben
    // Reiter und Benutzermenü nicht in die auf max-w-6xl gedeckelte Leiste.
    // Der Admin erreicht seine Bestellungen dort über das Benutzermenü.
    ...(user ? [{ href: "/orders", label: "Bestellungen", erstAbXl: isAdmin }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Verwaltung" }] : []),
    // Eigenes Portal für Ladengeschäft und Buchhaltung, nur für Admins –
    // deshalb hervorgehoben statt als weiterer grauer Reiter.
    ...(isAdmin
      ? [{ href: "/kasse", label: "Kasse", hervorgehoben: true }]
      : []),
    // Nur im Klappmenü: in der breiten Leiste ist kein Platz mehr, dort
    // stehen sie in der Fußzeile und in der Schnellleiste der Startseite.
    { href: "/merkliste", label: "Merkliste", nurMenue: true },
    { href: "/faq", label: "FAQ", nurMenue: true },
    { href: "/kontakt", label: "Kontakt", nurMenue: true },
  ];

  return (
    <header className="sticky top-0 z-40 bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 leading-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          {logoPath ? (
            <span className="relative block size-9 shrink-0 transition-transform duration-300 group-hover:scale-105 sm:size-10">
              <Image
                src={logoPath}
                alt="LIDER Groß- und Einzelhandel"
                fill
                sizes="40px"
                priority
                className="object-contain"
              />
            </span>
          ) : null}
          {wordmarkPath ? (
            /* Auf dem Handy kleiner: Wappen, Schriftzug, Warenkorb,
               Benutzermenü und Klappmenü zusammen brauchten bei 390 px mehr
               Platz als die Leiste hat – die Seite ließ sich seitlich
               schieben. Die Breite folgt der Höhe über das Seitenverhältnis
               der Datei, damit der Schriftzug nicht verzerrt. */
            <span
              className="relative block h-7 w-[calc(1.75rem*var(--wortmarke-ar))] sm:h-10 sm:w-[calc(2.5rem*var(--wortmarke-ar))]"
              style={
                {
                  "--wortmarke-ar": String(LOGO_WORDMARK_ASPECT),
                } as React.CSSProperties
              }
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

        <div className="flex shrink-0 items-center gap-1">
          {/* Auf dem Handy nur im Klappmenü – die Leiste ist dort voll. */}
          <div className="hidden sm:block">
            <MerklisteLink />
          </div>
          {user ? <CartLink /> : null}
          {user ? (
            <UserMenu
              label={user.company_name || user.full_name || user.email}
              email={user.email}
              isAdmin={isAdmin}
              kompakt={isAdmin}
            />
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link
                href="/register"
                className="rounded-md border border-surface-dark-border px-3 py-1.5 text-sm font-medium text-surface-dark-foreground transition-colors duration-200 hover:border-gold/60 hover:bg-white/10"
              >
                Registrieren
              </Link>
              <Link
                href="/login"
                className="rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-gold-foreground transition-all duration-200 hover:bg-gold/85 hover:shadow-md hover:shadow-gold/25"
              >
                Anmelden
              </Link>
            </div>
          )}
          <div className="lg:hidden">
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

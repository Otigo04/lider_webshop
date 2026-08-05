import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-surface-dark-border bg-surface-dark text-surface-dark-muted">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-surface-dark-foreground">
              LIDER
            </p>
            <p className="mt-1 text-sm">
              Groß- und Einzelhandel, Berlin. Seit 2007.
            </p>
          </div>

          <dl className="grid gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-surface-dark-muted/70">Telefon</dt>
              <dd className="text-surface-dark-foreground">[TELEFON]</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-surface-dark-muted/70">E-Mail</dt>
              <dd className="text-surface-dark-foreground">[E-MAIL]</dd>
            </div>
          </dl>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-surface-dark-border pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LIDER Berlin Groß- und Einzelhandel</p>
          <nav className="flex gap-6">
            <Link
              href="/impressum"
              className="hover:text-surface-dark-foreground"
            >
              Impressum
            </Link>
            <Link
              href="/datenschutz"
              className="hover:text-surface-dark-foreground"
            >
              Datenschutz
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

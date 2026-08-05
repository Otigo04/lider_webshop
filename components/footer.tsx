import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Lider Großhandel</p>
        <nav className="flex gap-4">
          <Link href="/impressum" className="hover:text-foreground">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-foreground">
            Datenschutz
          </Link>
        </nav>
      </div>
    </footer>
  );
}

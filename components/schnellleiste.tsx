import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Schnellleiste über dem Kopfbereich der Startseite.
 *
 * Reine Textlinks in einer Zeile, wie die Kategorieleiste großer
 * Versandhändler: keine Kästchen, keine Symbole, keine Farbpunkte. Die erste
 * Fassung trug all das und sah neben dem Kopfbereich überladen aus – eine
 * Navigationszeile soll man lesen, nicht betrachten.
 *
 * Einzige Auszeichnung: „Reduziert" in Signalrot, weil es die Aktion ist.
 * Merkliste, FAQ und Kontakt stehen im Klappmenü und in der Fußzeile, nicht
 * hier – die Zeile gehört dem Sortiment.
 *
 * Seitlich schiebbar statt umbrechend: zwei Zeilen Links schöben das
 * Schaufenster aus dem ersten Bild.
 */
export function Schnellleiste({
  warengruppen,
}: {
  warengruppen: { slug: string; name: string }[];
}) {
  const link =
    "shrink-0 whitespace-nowrap py-3 text-sm text-foreground/80 transition-colors hover:text-foreground hover:underline underline-offset-[6px] decoration-1";

  return (
    <nav aria-label="Schnellzugriff" className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/shop/reduziert"
          className={cn(link, "font-semibold text-signal hover:text-signal")}
        >
          Reduziert
        </Link>
        <Link href="/shop/neuheiten" className={link}>
          Neuheiten
        </Link>
        <Link href="/shop/topseller" className={link}>
          Topseller
        </Link>
        {warengruppen.map((gruppe) => (
          <Link key={gruppe.slug} href={`/shop/${gruppe.slug}`} className={link}>
            {gruppe.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

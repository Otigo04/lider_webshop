import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Schnellleiste über dem Kopfbereich der Startseite.
 *
 * In der Fläche der Kopfleiste und des Kopfbereichs (Navy), damit sie sich
 * als Teil davon liest und nicht als weißer Streifen dazwischen. Die Einträge
 * sind schlichte Knöpfe mit dünnem Rand – klar als anklickbar erkennbar, aber
 * ohne Symbole und Farbpunkte; die erste Fassung damit war überladen.
 * Beim Überfahren färbt sich der Rand gold, wie der Balken unter den
 * Reitern der Kopfleiste.
 *
 * Einzige Auszeichnung: „Reduziert" als rot gefüllter Knopf – die Aktion.
 * Merkliste, FAQ und Kontakt stehen im Klappmenü und in der Fußzeile, nicht
 * hier – die Zeile gehört dem Sortiment.
 *
 * Seitlich schiebbar statt umbrechend: zwei Zeilen Knöpfe schöben das
 * Schaufenster aus dem ersten Bild.
 */
export function Schnellleiste({
  warengruppen,
}: {
  warengruppen: { slug: string; name: string }[];
}) {
  const knopf =
    "shrink-0 whitespace-nowrap rounded-full border border-white/15 px-4 py-1.5 text-sm font-medium text-surface-dark-foreground/90 transition-colors duration-200 hover:border-gold hover:bg-white/[0.06] hover:text-surface-dark-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

  return (
    <nav
      aria-label="Schnellzugriff"
      className="border-b border-surface-dark-border bg-surface-dark"
    >
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/shop/reduziert"
          className={cn(
            knopf,
            "border-signal bg-signal font-semibold text-signal-foreground hover:border-signal hover:bg-signal/85 hover:text-signal-foreground",
          )}
        >
          Reduziert
        </Link>
        <Link href="/shop/neuheiten" className={knopf}>
          Neuheiten
        </Link>
        <Link href="/shop/topseller" className={knopf}>
          Topseller
        </Link>
        {warengruppen.map((gruppe) => (
          <Link key={gruppe.slug} href={`/shop/${gruppe.slug}`} className={knopf}>
            {gruppe.name}
          </Link>
        ))}
      </div>
    </nav>
  );
}

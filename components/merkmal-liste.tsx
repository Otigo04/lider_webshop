import type { ProductAttributeGroup } from "@/lib/types";

/**
 * Merkmale eines Artikels im Shop (Migration 032).
 *
 * Eine Beschreibungsliste und keine Kästchenreihe: hier wird nichts
 * ausgewählt, hier steht, was der Artikel ist. Ausgewählt wird in der
 * Filterspalte des Sortiments.
 *
 * Die Farbe steht als Kreis **und** als Wort. Ein Kreis allein wäre für
 * Farbfehlsichtige keine Angabe, und „Bordeaux" allein sagt nichts über den
 * Ton – erst beides zusammen ist die Auskunft.
 */
export function MerkmalListe({
  attributes,
  valueIds,
  className,
}: {
  attributes: ProductAttributeGroup[];
  /** Am Artikel gesetzte Werte */
  valueIds: string[];
  className?: string;
}) {
  const gesetzt = new Set(valueIds);

  const zeilen = attributes
    .map((attribut) => ({
      attribut,
      werte: attribut.values.filter((wert) => gesetzt.has(wert.id)),
    }))
    .filter((zeile) => zeile.werte.length > 0);

  if (zeilen.length === 0) return null;

  return (
    <dl className={className}>
      {zeilen.map(({ attribut, werte }) => (
        <div
          key={attribut.id}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border py-2 last:border-0"
        >
          <dt className="w-28 shrink-0 text-sm text-muted-foreground">
            {attribut.name}
          </dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {werte.map((wert) => (
              <span key={wert.id} className="flex items-center gap-1.5">
                {attribut.kind === "color" ? (
                  <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full border border-black/20"
                    style={{ backgroundColor: wert.hex ?? "transparent" }}
                  />
                ) : null}
                {wert.label}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

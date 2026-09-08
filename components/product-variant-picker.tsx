import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Auswahlfeld } from "@/lib/product-groups";

/**
 * Ausführungen eines Angebots auswählen (Migration 033).
 *
 * **Links, keine Schaltflächen mit Zustand.** Jede Ausführung ist ein eigener
 * Artikel mit eigener Adresse; die Auswahl wechselt also die Seite, statt im
 * Browser etwas umzuschalten. Das kostet einen Seitenaufruf und bringt drei
 * Dinge, die eine Client-Auswahl nicht hätte: die Adresse lässt sich
 * verschicken und als Lesezeichen ablegen, der Zurück-Knopf tut, was er soll,
 * und Preis, Bestand, Staffeln und Fotos kommen frisch vom Server – nichts
 * davon müsste vorab für alle Ausführungen mitgeladen und im Browser
 * durchgetauscht werden.
 *
 * Farbwerte tragen ihren Farbkreis, alles andere steht als Wort da – dieselbe
 * Unterscheidung wie in der Filterspalte und im Adminbereich.
 */
export function ProductVariantPicker({
  felder,
  className,
}: {
  felder: Auswahlfeld[];
  className?: string;
}) {
  if (felder.length === 0) return null;

  return (
    <div className={cn("space-y-5", className)}>
      {felder.map(({ attribut, werte }) => {
        const gewaehlt = werte.find((wert) => wert.aktiv);

        return (
          <div key={attribut.id}>
            <p className="text-sm">
              <span className="font-medium">{attribut.name}:</span>{" "}
              <span className="text-muted-foreground">
                {gewaehlt?.wert.label ?? "bitte wählen"}
              </span>
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {werte.map(({ wert, aktiv, zielId, ausverkauft }) => {
                const inhalt = (
                  <>
                    {attribut.kind === "color" ? (
                      <span
                        aria-hidden
                        className="relative flex size-5 shrink-0 items-center justify-center rounded-full border border-black/20"
                        style={{ backgroundColor: wert.hex ?? "transparent" }}
                      >
                        {aktiv ? (
                          <Check
                            className="size-3 drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]"
                            stroke="white"
                            strokeWidth={3.5}
                          />
                        ) : null}
                      </span>
                    ) : null}
                    <span className={ausverkauft ? "line-through" : undefined}>
                      {wert.label}
                    </span>
                  </>
                );

                const grundStil =
                  "flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm transition-colors";

                // Die aktive Ausführung ist keine Auswahl mehr, sondern eine
                // Anzeige – ein Link auf die Seite, auf der man schon steht,
                // wäre ein Klick ins Leere.
                if (aktiv) {
                  return (
                    <span
                      key={wert.id}
                      aria-current="true"
                      className={cn(
                        grundStil,
                        "border-brand bg-brand-soft font-semibold text-brand",
                      )}
                    >
                      {inhalt}
                    </span>
                  );
                }

                // Gibt es den Wert im ganzen Bündel nicht mehr – etwa weil die
                // einzige Ausführung damit ausgeblendet ist –, bleibt er
                // sichtbar, aber tot. Ihn wegzulassen hieße, dass die Auswahl
                // je nach Standpunkt anders aussieht.
                if (!zielId) {
                  return (
                    <span
                      key={wert.id}
                      aria-disabled="true"
                      title="Nicht im Sortiment"
                      className={cn(
                        grundStil,
                        "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60",
                      )}
                    >
                      {inhalt}
                    </span>
                  );
                }

                return (
                  <Link
                    key={wert.id}
                    href={`/shop/product/${zielId}`}
                    scroll={false}
                    title={ausverkauft ? "Zurzeit nicht verfügbar" : undefined}
                    className={cn(
                      grundStil,
                      "border-border bg-card hover:border-brand/50 hover:bg-muted",
                      ausverkauft && "text-muted-foreground",
                    )}
                  >
                    {inhalt}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SalePrice } from "@/components/sale-price";
import { formatPrice } from "@/lib/format";
import { reduzierung } from "@/lib/pricing";

/**
 * Ersetzt ProductPurchase für nicht angemeldete Besucher. Zeigt den
 * "ab"-Preis, damit die Seite nicht ohne jede Zahl dasteht – die Staffeln
 * selbst bleiben dem Kundenkonto vorbehalten.
 */
export function PublicPurchaseCta({
  priceFrom,
  minOrderQuantity,
  listPrice = null,
}: {
  priceFrom: number | null;
  minOrderQuantity: number | null;
  /** Vorher-Preis für die Rabattanzeige (Migration 023) */
  listPrice?: number | null;
}) {
  const rabatt = reduzierung(listPrice, priceFrom);

  return (
    <div className="rounded-md border border-border">
      {priceFrom !== null ? (
        <div className="border-b border-border bg-muted p-5">
          <p className="eyebrow text-muted-foreground">
            {rabatt ? "Reduziert" : "Großhandelspreis"}
          </p>
          {rabatt ? (
            <SalePrice reduktion={rabatt} suffix="/ Stück netto" groesse="gross" className="mt-2" />
          ) : (
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-sm text-muted-foreground">ab</span>
              <span className="text-3xl font-bold tabular">
                {formatPrice(priceFrom)}
              </span>
              <span className="text-sm text-muted-foreground">
                / Stück netto
              </span>
            </p>
          )}
          {/* Der Zusatz gehört an jeden öffentlich sichtbaren Preis: das
              Portal richtet sich an Gewerbekunden, Nettopreise sind nur mit
              diesem Hinweis eindeutig. */}
          <p className="mt-1 text-sm text-muted-foreground">zzgl. USt.</p>
          {minOrderQuantity ? (
            <p className="mt-1 text-sm text-muted-foreground tabular">
              Mindestabnahme {minOrderQuantity} Stück
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="p-5">
        <p className="font-medium">Staffelpreise und Bestellung mit Kundenkonto</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcher Preis ab welcher Menge gilt, der verfügbare Bestand und die
          Bestellung selbst stehen nach der Anmeldung bereit. Noch kein Konto?
          Das Anlegen dauert zwei Minuten, eine Freischaltung ist nicht nötig.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* Konto anlegen steht vorn: wer hier landet, hat meist noch keins. */}
          <Button asChild>
            <Link href="/register">Konto anlegen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Anmelden</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";

/**
 * Ersetzt ProductPurchase für nicht angemeldete Besucher. Zeigt den
 * "ab"-Preis, damit die Seite nicht ohne jede Zahl dasteht – die Staffeln
 * selbst bleiben dem Kundenkonto vorbehalten.
 */
export function PublicPurchaseCta({
  priceFrom,
  minOrderQuantity,
}: {
  priceFrom: number | null;
  minOrderQuantity: number | null;
}) {
  return (
    <div className="rounded-md border border-border">
      {priceFrom !== null ? (
        <div className="border-b border-border bg-muted p-5">
          <p className="eyebrow text-muted-foreground">Großhandelspreis</p>
          <p className="mt-2 flex items-baseline gap-1.5">
            <span className="text-sm text-muted-foreground">ab</span>
            <span className="text-3xl font-bold tabular">
              {formatPrice(priceFrom)}
            </span>
            <span className="text-sm text-muted-foreground">/ Stück</span>
          </p>
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
          Zugang lässt sich über das Formular auf der Startseite anfragen.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login">Anmelden</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/#kontakt">Zugang anfragen</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

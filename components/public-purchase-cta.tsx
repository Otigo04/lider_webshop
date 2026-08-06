import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Ersetzt ProductPurchase für nicht angemeldete Besucher. */
export function PublicPurchaseCta() {
  return (
    <div className="rounded-md border border-border p-5">
      <p className="font-medium">Preise und Bestellung nur mit Kundenkonto</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Staffelpreise, Bestand und die Möglichkeit zu bestellen sehen Sie nach
        der Anmeldung. Noch kein Konto? Zugang lässt sich über das Formular
        auf der Startseite anfragen.
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
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";

export const metadata: Metadata = {
  title: "Versand und Lieferung",
  description:
    "Versandkosten, Selbstabholung in Berlin und Ablauf einer Bestellung bei LIDER.",
  alternates: { canonical: "/versand" },
};

/**
 * Was ein Händler wissen will, bevor er ein Konto anlegt: was der Versand
 * kostet, ob er abholen kann und wie eine Bestellung abläuft.
 *
 * Alle Angaben stammen aus dem Code und nicht aus einer Annahme: die
 * Freigrenze aus lib/shipping.ts, der Ablauf aus lib/actions/orders.ts und
 * den Bestellstatus-Bezeichnungen. Ändert sich die Grenze, ändert sich diese
 * Seite mit – deshalb steht sie als Konstante hier und nicht als Zahl im Text.
 *
 * Keine AGB: die gehören von einem Anwalt geschrieben, nicht aus dem
 * Quelltext abgeleitet.
 */
export default function VersandPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="eyebrow text-gold">Für Gewerbekunden</p>
      <h1 className="headline mt-3 text-3xl font-bold">Versand und Lieferung</h1>

      <div className="mt-10 space-y-10 text-sm leading-relaxed">
        <section>
          <h2 className="text-base font-semibold">Versandkosten</h2>
          <p className="mt-2 text-muted-foreground">
            Ab {FREE_SHIPPING_THRESHOLD} € netto Warenwert liefern wir
            versandkostenfrei. Darunter richten sich die Kosten nach Gewicht
            und Zielort; wir teilen sie mit der Auftragsbestätigung mit, bevor
            die Ware das Haus verlässt.
          </p>
          <p className="mt-3 text-muted-foreground">
            Die Bestellsumme im Warenkorb ist immer der reine Warenwert. Der
            Versand wird nie stillschweigend aufgeschlagen.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Selbstabholung</h2>
          <p className="mt-2 text-muted-foreground">
            Sie können jede Bestellung stattdessen bei uns in Berlin abholen.
            Die Wahl treffen Sie pro Bestellung im Bestellformular; bei
            Abholung fallen keine Versandkosten an. Wir melden uns, sobald die
            Ware bereitsteht.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Ablauf einer Bestellung</h2>
          <ol className="mt-3 space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">1. Bestellen</span>{" "}
              – Sie geben die Bestellung im Portal auf und erhalten sofort eine
              Bestätigung per E-Mail.
            </li>
            <li>
              <span className="font-medium text-foreground">2. Prüfen</span> –
              wir bestätigen Verfügbarkeit und, falls nötig, die Versandkosten.
            </li>
            <li>
              <span className="font-medium text-foreground">3. Versand</span> –
              die Ware geht raus oder steht zur Abholung bereit. Den Stand
              sehen Sie jederzeit unter „Bestellungen“.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-base font-semibold">Preise</h2>
          <p className="mt-2 text-muted-foreground">
            Alle Preise im Portal verstehen sich netto zzgl. der gesetzlichen
            Umsatzsteuer. Das Portal richtet sich ausschließlich an
            Gewerbetreibende.
          </p>
          <p className="mt-3 text-muted-foreground">
            Liefern wir an einen Abnehmer im EU-Ausland, brauchen wir Ihre
            USt-IdNr. Sie können sie in Ihrem Konto unter „Stammdaten“
            hinterlegen; sie erscheint dann auf jeder Rechnung.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold">Fragen</h2>
          <p className="mt-2 text-muted-foreground">
            Bei Rückfragen, Sonderkonditionen oder größeren Abnahmemengen
            sprechen Sie direkt mit uns – die Kontaktdaten stehen im{" "}
            <Link href="/impressum" className="font-medium text-foreground underline">
              Impressum
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

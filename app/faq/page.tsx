import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getPublicContact } from "@/lib/queries/settings";
import { formatThreshold } from "@/lib/shipping";

export const metadata: Metadata = {
  title: "Häufige Fragen",
  description:
    "Konto, Preise, Staffeln, Zahlung, Versand und Abholung bei LIDER – kurz beantwortet.",
  alternates: { canonical: "/faq" },
};

/**
 * Häufige Fragen.
 *
 * Jede Antwort beschreibt, was das Portal tatsächlich tut – Registrierung,
 * Staffelpreise, Zahlarten und Abholung folgen den Regeln aus
 * lib/actions/orders.ts und Migration 029. Ändert sich dort etwas, gehört
 * es hier nachgezogen. Die Versandgrenze kommt aus den Firmendaten und steht
 * deshalb nicht als Zahl im Text.
 *
 * Aufklappbar über <details>: kein Skript, funktioniert ohne JavaScript und
 * die Suche im Browser findet auch zugeklappte Antworten.
 */
export default async function FaqPage() {
  const { free_shipping_threshold: versandFreiAb } = await getPublicContact();

  const gruppen: { titel: string; fragen: { frage: string; antwort: React.ReactNode }[] }[] = [
    {
      titel: "Konto",
      fragen: [
        {
          frage: "Wer kann bei LIDER bestellen?",
          antwort:
            "Das Portal richtet sich an Gewerbekunden – Händler, Kioske, Märkte und Wiederverkäufer. Privatkunden kaufen bei uns im Laden.",
        },
        {
          frage: "Wie lange dauert die Freischaltung?",
          antwort: (
            <>
              Gar nicht: nach der{" "}
              <Link href="/register" className="font-medium text-brand hover:underline">
                Registrierung
              </Link>{" "}
              ist das Konto sofort aktiv, Preise und Bestände sind direkt sichtbar.
            </>
          ),
        },
        {
          frage: "Ich habe mein Passwort vergessen.",
          antwort: (
            <>
              Unter{" "}
              <Link href="/forgot-password" className="font-medium text-brand hover:underline">
                Passwort vergessen
              </Link>{" "}
              schicken wir Ihnen einen Link, mit dem Sie ein neues setzen.
            </>
          ),
        },
      ],
    },
    {
      titel: "Preise und Bestellung",
      fragen: [
        {
          frage: "Warum sehe ich ohne Anmeldung nur einen „ab“-Preis?",
          antwort:
            "Ohne Konto zeigen wir den günstigsten Stückpreis eines Artikels. Die vollständige Preisstaffel und der aktuelle Bestand erscheinen nach der Anmeldung.",
        },
        {
          frage: "Wie funktionieren die Staffelpreise?",
          antwort:
            "Je größer die Menge, desto günstiger der Stückpreis. Welche Staffel gilt, rechnet der Warenkorb selbst aus, sobald Sie die Menge ändern – Sie müssen nichts auswählen.",
        },
        {
          frage: "Gibt es eine Mindestabnahme?",
          antwort:
            "Bei manchen Artikeln ja. Steht auf der Karte oder der Artikelseite „Abnahme ab … Stück“, beginnt die Bestellmenge dort. Ohne diesen Hinweis ist jede Menge ab einem Stück möglich.",
        },
        {
          frage: "Sind die Preise netto oder brutto?",
          antwort:
            "Alle Preise im Portal sind Nettopreise zuzüglich Umsatzsteuer. Warenkorb, Bestellung und Rechnung zeigen netto und brutto nebeneinander.",
        },
        {
          frage: "Kann ich Artikel für später vormerken?",
          antwort: (
            <>
              Ja, mit dem Herz auf jeder Artikelkachel. Die{" "}
              <Link href="/merkliste" className="font-medium text-brand hover:underline">
                Merkliste
              </Link>{" "}
              wird in Ihrem Browser gespeichert und funktioniert auch ohne Anmeldung.
            </>
          ),
        },
        {
          frage: "Wo sehe ich den Stand meiner Bestellung?",
          antwort: (
            <>
              Unter{" "}
              <Link href="/orders" className="font-medium text-brand hover:underline">
                Bestellungen
              </Link>{" "}
              steht jede Bestellung mit Status, Positionen und Betrag.
            </>
          ),
        },
      ],
    },
    {
      titel: "Zahlung",
      fragen: [
        {
          frage: "Welche Zahlarten gibt es?",
          antwort:
            "Überweisung ist immer möglich. Bar- oder Kartenzahlung nur bei Selbstabholung – bezahlt wird dann bei der Übergabe.",
        },
        {
          frage: "Was gebe ich bei der Überweisung als Verwendungszweck an?",
          antwort:
            "Die Rechnungsnummer. Sie steht nach dem Absenden direkt auf der Bestellseite, zusammen mit Betrag, Bankverbindung und Zahlungsziel.",
        },
      ],
    },
    {
      titel: "Versand und Abholung",
      fragen: [
        {
          frage: "Was kostet der Versand?",
          antwort: (
            <>
              Ab {formatThreshold(versandFreiAb)} netto Warenwert liefern wir
              versandkostenfrei. Alles Weitere steht unter{" "}
              <Link href="/versand" className="font-medium text-brand hover:underline">
                Versand
              </Link>
              .
            </>
          ),
        },
        {
          frage: "Kann ich die Ware abholen?",
          antwort:
            "Ja. Wählen Sie im Bestellformular „Abholung“ und auf Wunsch einen Termin – frühestens am nächsten Tag ab 8 Uhr, damit wir in Ruhe kommissionieren können. Sobald die Ware bereitsteht, bekommen Sie eine E-Mail.",
        },
        {
          frage: "Kann ich eine Lieferadresse nur für eine Bestellung angeben?",
          antwort:
            "Ja. Im Bestellformular lässt sich eine abweichende Anschrift eintragen. Sie gilt nur für diese Bestellung, Ihre hinterlegte Adresse bleibt unverändert.",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="eyebrow text-gold">Kurz beantwortet</p>
      <h1 className="headline mt-3 text-3xl font-bold">Häufige Fragen</h1>

      <div className="mt-10 space-y-10">
        {gruppen.map((gruppe) => (
          <section key={gruppe.titel}>
            <h2 className="text-base font-semibold">{gruppe.titel}</h2>
            <div className="mt-3 divide-y divide-border rounded-lg border border-border">
              {gruppe.fragen.map(({ frage, antwort }) => (
                <details key={frage} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    {frage}
                    <ChevronDown
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {antwort}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 text-sm text-muted-foreground">
        Nicht dabei?{" "}
        <Link href="/kontakt" className="font-medium text-brand hover:underline">
          Rufen Sie uns an oder schreiben Sie uns
        </Link>
        .
      </p>
    </div>
  );
}

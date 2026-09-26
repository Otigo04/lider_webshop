import Link from "next/link";
import { formatThreshold } from "@/lib/shipping";

/**
 * Häufige Fragen – eine Quelle für beide Orte.
 *
 * Die Fragen stehen auf der Startseite (gekürzt) und unter /faq (vollständig).
 * Zwei Listen liefen auseinander: eine Änderung am Zahlungsziel oder an der
 * Versandgrenze hätte man an einer Stelle nachgezogen und an der anderen
 * vergessen, und dann widersprächen sich zwei Seiten derselben Website.
 *
 * Jede Antwort beschreibt, was das Portal tatsächlich tut – Registrierung,
 * Staffelpreise, Zahlarten und Abholung folgen den Regeln aus
 * lib/actions/orders.ts und Migration 029. Ändert sich dort etwas, gehört es
 * hier nachgezogen. Die Versandgrenze kommt aus den Firmendaten und steht
 * deshalb nicht als Zahl im Text.
 */

export interface FaqFrage {
  frage: string;
  antwort: React.ReactNode;
  /**
   * Gehört auf die Startseite. Dort stehen nur die Fragen, die vor dem ersten
   * Klick anfallen – wer sich schon eingelesen hat, klickt auf /faq weiter.
   * Eine vollständige Liste auf der Startseite wäre eine zweite FAQ-Seite mit
   * dem Sortiment darüber.
   */
  wichtig?: boolean;
}

export interface FaqGruppe {
  titel: string;
  fragen: FaqFrage[];
}

export function faqGruppen(versandFreiAb: number): FaqGruppe[] {
  return [
    {
      titel: "Konto",
      fragen: [
        {
          frage: "Wer kann bei LIDER bestellen?",
          wichtig: true,
          antwort:
            "Das Portal richtet sich an Gewerbekunden – Händler, Kioske, Märkte und Wiederverkäufer. Privatkunden kaufen bei uns im Laden.",
        },
        {
          frage: "Wie lange dauert die Freischaltung?",
          wichtig: true,
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
          frage: "Was brauche ich für die Registrierung?",
          antwort:
            "Firmenname, Anschrift und eine E-Mail-Adresse, unter der wir Sie erreichen. Die Anschrift ist Pflicht, weil sie auf der Rechnung steht – ändern lässt sie sich jederzeit im Konto.",
        },
        {
          frage: "Ich habe mein Passwort vergessen.",
          antwort: (
            <>
              Unter{" "}
              <Link
                href="/forgot-password"
                className="font-medium text-brand hover:underline"
              >
                Passwort vergessen
              </Link>{" "}
              schicken wir Ihnen einen Link, mit dem Sie ein neues setzen.
            </>
          ),
        },
        {
          frage: "Können mehrere Personen aus meiner Firma bestellen?",
          antwort:
            "Ein Konto gehört zu einer Firma und darf im Betrieb weitergegeben werden. Wer getrennte Zugänge braucht, sagt uns Bescheid – wir legen sie an.",
        },
        {
          frage: "Wie werde ich meine Daten wieder los?",
          antwort: (
            <>
              Auf Zuruf. Schreiben Sie uns über{" "}
              <Link href="/kontakt" className="font-medium text-brand hover:underline">
                Kontakt
              </Link>
              ; wir löschen das Konto. Rechnungen müssen wir gesetzlich zehn Jahre
              aufbewahren, die bleiben davon unberührt.
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
          wichtig: true,
          antwort:
            "Ohne Konto zeigen wir den günstigsten Stückpreis eines Artikels. Die vollständige Preisstaffel und der aktuelle Bestand erscheinen nach der Anmeldung.",
        },
        {
          frage: "Wie funktionieren die Staffelpreise?",
          wichtig: true,
          antwort:
            "Je größer die Menge, desto günstiger der Stückpreis. Welche Staffel gilt, rechnet der Warenkorb selbst aus, sobald Sie die Menge ändern – Sie müssen nichts auswählen.",
        },
        {
          frage: "Sind die Preise netto oder brutto?",
          wichtig: true,
          antwort:
            "Alle Preise im Portal sind Nettopreise zuzüglich Umsatzsteuer. Warenkorb, Bestellung und Rechnung zeigen netto und brutto nebeneinander.",
        },
        {
          frage: "Gibt es eine Mindestabnahme?",
          antwort:
            "Bei manchen Artikeln ja. Steht auf der Karte oder der Artikelseite „Abnahme ab … Stück“, beginnt die Bestellmenge dort. Ohne diesen Hinweis ist jede Menge ab einem Stück möglich.",
        },
        {
          frage: "Ist der angezeigte Bestand verbindlich?",
          antwort:
            "Er ist der Stand aus unserem Lager, inklusive der Mengen, die bereits für andere Bestellungen reserviert sind. Bei sehr knappen Stückzahlen rufen wir an, bevor wir kommissionieren.",
        },
        {
          frage: "Was bedeuten die Ausführungen bei einem Artikel?",
          antwort:
            "Manche Artikel gibt es in mehreren Varianten – Farbe, Größe, Wattzahl. Jede Ausführung hat ihren eigenen Preis und Bestand; die Auswahl auf der Artikelseite wechselt zwischen ihnen.",
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
        {
          frage: "Kann ich eine Bestellung noch ändern oder stornieren?",
          antwort:
            "Solange sie nicht kommissioniert ist: ja. Rufen Sie uns an oder schreiben Sie uns mit der Bestellnummer – im Portal selbst lässt sich eine abgesendete Bestellung nicht mehr bearbeiten.",
        },
        {
          frage: "Bekomme ich eine Rechnung als PDF?",
          antwort:
            "Ja. Die Rechnung wird beim Absenden erzeugt, kommt per E-Mail und liegt zusätzlich bei der Bestellung im Portal zum Herunterladen.",
        },
      ],
    },
    {
      titel: "Zahlung",
      fragen: [
        {
          frage: "Welche Zahlarten gibt es?",
          wichtig: true,
          antwort:
            "Überweisung ist immer möglich. Bar- oder Kartenzahlung nur bei Selbstabholung – bezahlt wird dann bei der Übergabe.",
        },
        {
          frage: "Was gebe ich bei der Überweisung als Verwendungszweck an?",
          antwort:
            "Die Rechnungsnummer. Sie steht nach dem Absenden direkt auf der Bestellseite, zusammen mit Betrag, Bankverbindung und Zahlungsziel.",
        },
        {
          frage: "Kann ich auf Rechnung mit Zahlungsziel kaufen?",
          antwort:
            "Das Zahlungsziel steht auf jeder Rechnung. Wer regelmäßig bestellt und andere Konditionen braucht, spricht uns an – das klären wir persönlich, nicht über ein Formular.",
        },
      ],
    },
    {
      titel: "Versand und Abholung",
      fragen: [
        {
          frage: "Was kostet der Versand?",
          wichtig: true,
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
          wichtig: true,
          antwort:
            "Ja. Wählen Sie im Bestellformular „Abholung“ und auf Wunsch einen Termin – frühestens am nächsten Tag ab 8 Uhr, damit wir in Ruhe kommissionieren können. Sobald die Ware bereitsteht, bekommen Sie eine E-Mail.",
        },
        {
          frage: "Wie lange dauert die Lieferung?",
          antwort:
            "Vorrätige Ware geht in der Regel am nächsten Werktag raus. Ist ein Artikel knapp, melden wir uns, bevor wir die Sendung teilen.",
        },
        {
          frage: "Kann ich eine Lieferadresse nur für eine Bestellung angeben?",
          antwort:
            "Ja. Im Bestellformular lässt sich eine abweichende Anschrift eintragen. Sie gilt nur für diese Bestellung, Ihre hinterlegte Adresse bleibt unverändert.",
        },
        {
          frage: "Liegt ein Lieferschein bei?",
          antwort:
            "Ja, jeder Sendung liegt ein Lieferschein mit Positionen und Mengen bei – ohne Preise, damit er beim Weiterverkauf im Karton bleiben kann.",
        },
        {
          frage: "Was ist mit beschädigter oder falscher Ware?",
          antwort:
            "Melden Sie den Schaden innerhalb von sieben Tagen nach Erhalt mit Bestellnummer und möglichst einem Foto. Wir ersetzen oder schreiben gut – so geht es schneller als über ein Rücksendeportal.",
        },
      ],
    },
  ];
}

/** Nur die Fragen für die Startseite, aus denselben Daten. */
export function faqWichtige(versandFreiAb: number): FaqFrage[] {
  return faqGruppen(versandFreiAb).flatMap((gruppe) =>
    gruppe.fragen.filter((frage) => frage.wichtig),
  );
}

/** Wie viele Fragen es insgesamt gibt – für „alle 28 Fragen ansehen“. */
export function faqAnzahl(versandFreiAb: number): number {
  return faqGruppen(versandFreiAb).reduce(
    (summe, gruppe) => summe + gruppe.fragen.length,
    0,
  );
}

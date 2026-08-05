import type { Metadata } from "next";

export const metadata: Metadata = { title: "Datenschutz" };

/**
 * Gerüst mit den Punkten, die für diese Anwendung tatsächlich zutreffen
 * (Supabase als Auftragsverarbeiter, Session-Cookies, Bestelldaten).
 * Der Text ist keine Rechtsberatung und muss vor dem Livegang geprüft werden.
 */
export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Datenschutzerklärung
      </h1>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-medium">Verantwortlicher</h2>
          <p className="mt-2 text-muted-foreground">
            [FIRMIERUNG], [STRASSE], [PLZ ORT], [E-MAIL]
          </p>
        </section>

        <section>
          <h2 className="font-medium">Welche Daten wir verarbeiten</h2>
          <p className="mt-2 text-muted-foreground">
            Für den Portalzugang: E-Mail-Adresse, Name, Firmenname. Beim
            Bestellen zusätzlich: bestellte Artikel, Mengen, Preise, Lieferadresse
            und Ihre Anmerkungen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO
            (Vertragsanbahnung und -durchführung).
          </p>
        </section>

        <section>
          <h2 className="font-medium">Cookies</h2>
          <p className="mt-2 text-muted-foreground">
            Wir setzen ausschließlich technisch notwendige Cookies für die
            Anmeldung. Kein Tracking, keine Analyse-Dienste, keine Werbe-Cookies.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Auftragsverarbeiter</h2>
          <p className="mt-2 text-muted-foreground">
            Datenbank, Anmeldung und Dateispeicher betreiben wir bei Supabase.
            Der Betrieb der Website erfolgt über Vercel. Mit beiden Anbietern
            besteht ein Vertrag zur Auftragsverarbeitung. Serverstandort:
            [REGION EINTRAGEN].
          </p>
        </section>

        <section>
          <h2 className="font-medium">Speicherdauer</h2>
          <p className="mt-2 text-muted-foreground">
            Bestelldaten bewahren wir im Rahmen der handels- und steuerrechtlichen
            Fristen auf. Zugangsdaten löschen wir auf Wunsch, sofern keine
            Aufbewahrungspflicht entgegensteht.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Ihre Rechte</h2>
          <p className="mt-2 text-muted-foreground">
            Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
            Datenübertragbarkeit und Widerspruch. Zudem steht Ihnen ein
            Beschwerderecht bei einer Aufsichtsbehörde zu.
          </p>
        </section>
      </div>
    </div>
  );
}

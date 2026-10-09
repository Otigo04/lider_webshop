import type { Metadata } from "next";
import { getPublicContact } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Datenschutz" };

/**
 * Gerüst mit den Punkten, die für diese Anwendung tatsächlich zutreffen
 * (Supabase als Auftragsverarbeiter, Session-Cookies, Bestelldaten).
 * Der Text ist keine Rechtsberatung und muss vor dem Livegang geprüft werden.
 * Firmenname, Anschrift und E-Mail im "Verantwortlicher"-Block kommen aus
 * den Firmendaten (/admin/settings), wie im Impressum.
 */
export default async function DatenschutzPage() {
  const firma = await getPublicContact();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Datenschutzerklärung
      </h1>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-medium">Verantwortlicher</h2>
          <p className="mt-2 text-muted-foreground">
            {firma.company_name ?? "LIDER Groß- und Einzelhandel"},{" "}
            {firma.address_street ?? "[STRASSE]"},{" "}
            {firma.address_zip && firma.address_city
              ? `${firma.address_zip} ${firma.address_city}`
              : "[PLZ ORT]"}
            , {firma.email ?? "[E-MAIL]"}
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
          <h2 className="font-medium">Registrierung und E-Mail-Bestätigung</h2>
          <p className="mt-2 text-muted-foreground">
            Das Kundenportal ist Gewerbekunden vorbehalten. Bei der Registrierung
            speichern wir E-Mail-Adresse, Name, Firmenname und die Bestätigung,
            dass Sie als Gewerbetreibender bestellen. Das Konto wird erst
            freigeschaltet, wenn Sie den Link in der Bestätigungsmail anklicken
            (Double-Opt-in); den Zeitpunkt der Bestätigung speichern wir.
            Bestätigungs- und Passwort-Links sind befristet und nur einmal
            nutzbar. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
          </p>
        </section>

        <section>
          <h2 className="font-medium">E-Mails</h2>
          <p className="mt-2 text-muted-foreground">
            Wir verschicken ausschließlich Mails, die zur Nutzung des Portals
            gehören: Bestätigung der Adresse, Zurücksetzen des Passworts,
            Bestellbestätigung, Statusänderungen und Rechnungen. Dafür übergeben
            wir Empfängeradresse und Mailinhalt an Resend. Werbliche Mails
            verschicken wir nur im Rahmen des Newsletters (siehe unten).
          </p>
        </section>

        <section>
          <h2 className="font-medium">Newsletter</h2>
          <p className="mt-2 text-muted-foreground">
            Wenn Sie den Newsletter abonnieren – bei der Registrierung oder
            später in Ihrem Kundenkonto –, schicken wir Ihnen per E-Mail
            Neuheiten, reduzierte Ware und Angebote. Dafür verarbeiten wir Ihre
            E-Mail-Adresse, Ihren Namen bzw. Firmennamen sowie den Zeitpunkt Ihrer
            Einwilligung. Rechtsgrundlage ist Ihre Einwilligung nach Art. 6 Abs. 1
            lit. a DSGVO in Verbindung mit § 7 Abs. 2 Nr. 3 UWG. Sie ist
            freiwillig; ohne sie können Sie das Portal uneingeschränkt nutzen.
          </p>
          <p className="mt-2 text-muted-foreground">
            Sie können den Newsletter jederzeit mit Wirkung für die Zukunft
            abbestellen: in Ihrem Kundenkonto unter „Newsletter“ oder über den
            Abmeldelink in jeder Newsletter-Mail. Danach erhalten Sie keine
            Newsletter mehr; den Zeitpunkt der Einwilligung und der Abmeldung
            bewahren wir als Nachweis auf. Der Versand erfolgt über Resend (siehe
            „Auftragsverarbeiter“). Wir werten nicht aus, ob und wann Sie
            Newsletter öffnen oder welche Links Sie anklicken.
          </p>
          <p className="mt-2 text-muted-foreground">
            Unabhängig davon können wir Ihnen einzelne persönliche Nachrichten zu
            Ihrer Geschäftsbeziehung oder auf Ihre Anfrage schicken (Art. 6 Abs. 1
            lit. b bzw. f DSGVO).
          </p>
        </section>

        <section>
          <h2 className="font-medium">Server-Logfiles</h2>
          <p className="mt-2 text-muted-foreground">
            Beim Aufruf der Website verarbeitet unser Hosting-Anbieter Vercel
            technisch notwendige Verbindungsdaten, darunter die IP-Adresse,
            Zeitpunkt, aufgerufene Adresse und Browserkennung. Das dient dem
            sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Daten
            werden nach kurzer Zeit automatisch gelöscht.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Cookies</h2>
          <p className="mt-2 text-muted-foreground">
            Technisch notwendige Cookies (Anmeldung) setzen wir immer –
            dafür ist nach Art. 6 Abs. 1 lit. f DSGVO und § 25 Abs. 2 TTDSG
            keine Einwilligung erforderlich.
          </p>
          <p className="mt-2 text-muted-foreground">
            Marketing-Cookies setzen wir ausschließlich mit Ihrer
            Einwilligung, die Sie beim ersten Besuch im Cookie-Banner geben
            oder ablehnen können. Welcher Anbieter dafür konkret zum Einsatz
            kommt, ergänzen wir hier, sobald er aktiv ist. Ihre Entscheidung
            lässt sich jederzeit über „Cookie-Einstellungen“ im Footer
            ändern.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Auftragsverarbeiter</h2>
          <p className="mt-2 text-muted-foreground">
            Datenbank, Anmeldung und Dateispeicher betreiben wir bei Supabase.
            Der Betrieb der Website erfolgt über Vercel, den Versand von
            E-Mails übernimmt Resend. Mit allen Anbietern besteht ein Vertrag
            zur Auftragsverarbeitung. Die Datenbank liegt in Rechenzentren
            innerhalb der Europäischen Union. Soweit Vercel und Resend Daten in
            den USA verarbeiten, stützt sich die Übermittlung auf
            Standardvertragsklauseln der EU-Kommission.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Speicherdauer</h2>
          <p className="mt-2 text-muted-foreground">
            Bestelldaten bewahren wir im Rahmen der handels- und steuerrechtlichen
            Fristen auf. Zugangsdaten löschen wir auf Wunsch, sofern keine
            Aufbewahrungspflicht entgegensteht. Ihre Newsletter-Einwilligung
            gilt bis zum Widerruf.
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

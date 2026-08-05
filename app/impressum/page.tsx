import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impressum" };

/**
 * Pflichtangaben nach § 5 DDG. Die Platzhalter müssen vor dem Livegang durch
 * die echten Firmendaten ersetzt werden – erfundene Angaben wären hier eine
 * Abmahnung wert.
 */
export default function ImpressumPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-medium">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2 text-muted-foreground">
            [FIRMIERUNG]
            <br />
            [STRASSE]
            <br />
            [PLZ ORT]
          </p>
        </section>

        <section>
          <h2 className="font-medium">Vertreten durch</h2>
          <p className="mt-2 text-muted-foreground">[GESCHÄFTSFÜHRUNG]</p>
        </section>

        <section>
          <h2 className="font-medium">Kontakt</h2>
          <p className="mt-2 text-muted-foreground">
            Telefon: [TELEFON]
            <br />
            E-Mail: [E-MAIL]
          </p>
        </section>

        <section>
          <h2 className="font-medium">Registereintrag</h2>
          <p className="mt-2 text-muted-foreground">
            Registergericht: [AMTSGERICHT]
            <br />
            Registernummer: [HRB]
          </p>
        </section>

        <section>
          <h2 className="font-medium">Umsatzsteuer-Identifikationsnummer</h2>
          <p className="mt-2 text-muted-foreground">
            gemäß § 27 a UStG: [USt-IdNr.]
          </p>
        </section>
      </div>
    </div>
  );
}

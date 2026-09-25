import type { Metadata } from "next";
import Image from "next/image";
import { getLogoPath } from "@/lib/logo";
import { getPublicContact } from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Impressum" };

/**
 * Pflichtangaben nach § 5 DDG. Firmenname, Anschrift, Vertretung, Kontakt und
 * USt-IdNr. kommen aus den Firmendaten (/admin/settings) über
 * getPublicContact() – ein Platzhalter unten heißt also "in den
 * Einstellungen nicht gepflegt", nicht "im Code vergessen". Registergericht
 * und Registernummer gibt es als Einstellung nicht (nicht jeder Betrieb ist
 * im Handelsregister eingetragen) und bleiben deshalb von Hand einzutragen.
 */
export default async function ImpressumPage() {
  const logoPath = getLogoPath();
  const firma = await getPublicContact();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      {/* Das Impressum ist die Seite, auf der sich der Betrieb ausweist –
          deshalb steht die Marke hier groß und nicht als Kopfzeilen-Icon. */}
      {logoPath ? (
        <Image
          src={logoPath}
          alt="LIDER Groß- und Einzelhandel"
          width={420}
          height={320}
          priority
          className="mb-10 h-auto w-64 object-contain sm:w-80"
        />
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight">Impressum</h1>

      <div className="mt-8 space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="font-medium">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2 text-muted-foreground">
            {firma.company_name ?? "LIDER Groß- und Einzelhandel"}
            <br />
            {firma.address_street ?? "[STRASSE]"}
            <br />
            {firma.address_zip && firma.address_city
              ? `${firma.address_zip} ${firma.address_city}`
              : "[PLZ ORT]"}
          </p>
        </section>

        <section>
          <h2 className="font-medium">Vertreten durch</h2>
          <p className="mt-2 text-muted-foreground">
            {firma.owner_name ?? "[GESCHÄFTSFÜHRUNG]"}
          </p>
        </section>

        <section>
          <h2 className="font-medium">Kontakt</h2>
          <p className="mt-2 text-muted-foreground">
            Telefon: {firma.phone ?? "[TELEFON]"}
            <br />
            E-Mail: {firma.email ?? "[E-MAIL]"}
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
            gemäß § 27 a UStG: {firma.vat_id ?? "[USt-IdNr.]"}
          </p>
        </section>
      </div>
    </div>
  );
}

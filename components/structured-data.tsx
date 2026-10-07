import { siteUrl } from "@/lib/site";
import type { PublicContact } from "@/lib/queries/settings";

/**
 * Firmendaten als schema.org-JSON-LD für Suchmaschinen (Startseite).
 *
 * Google zieht daraus Name, Adresse, Telefon und Logo für Wissensfeld und
 * Karteneinträge. Angaben, die in den Firmendaten fehlen, bleiben weg – nichts
 * wird erfunden. Öffnungszeiten stehen bewusst nicht drin, solange sie nirgends
 * gepflegt sind.
 */
export function StructuredData({ firma }: { firma: PublicContact }) {
  const basis = siteUrl();

  const adresse =
    firma.address_street && firma.address_zip && firma.address_city
      ? {
          "@type": "PostalAddress",
          streetAddress: firma.address_street,
          postalCode: firma.address_zip,
          addressLocality: firma.address_city,
          addressCountry: "DE",
        }
      : undefined;

  const daten = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${basis}/#firma`,
    name: "LIDER",
    description: "Groß- und Einzelhandel für Spielzeug, Multimedia und Handyzubehör.",
    url: basis,
    logo: `${basis}/logo/logo-mark.png`,
    image: `${basis}/logo/logo.png`,
    telephone: firma.phone ?? undefined,
    email: firma.email ?? undefined,
    vatID: firma.vat_id ?? undefined,
    address: adresse,
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify entschärft "<" nicht; ein "</script>" in den Firmendaten
      // würde den Block beenden.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(daten).replace(/</g, "\\u003c") }}
    />
  );
}

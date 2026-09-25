import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { getPublicContact } from "@/lib/queries/settings";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Telefon, E-Mail und Anschrift von LIDER Groß- und Einzelhandel.",
  alternates: { canonical: "/kontakt" },
};

/**
 * Kontaktseite. Alle Angaben aus company_settings über
 * public_company_contact() (Migration 036) – wie Fußzeile und Startseite.
 * Fehlt ein Wert, steht der Platzhalter da, statt dass die Zeile still
 * verschwindet: so fällt die Lücke dem Admin auf.
 *
 * Kein Kontaktformular: eine Nachricht, die in einem Postfach landet, das
 * niemand liest, ist schlechter als eine Telefonnummer.
 */
export default async function KontaktPage() {
  const firma = await getPublicContact();

  const anschrift =
    firma.address_street && firma.address_city
      ? `${firma.address_street}, ${firma.address_zip ?? ""} ${firma.address_city}`.replace(
          /\s+/g,
          " ",
        )
      : null;

  const telefon = firma.phone?.replace(/[^+\d]/g, "");

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="eyebrow text-gold">Direkter Draht</p>
      <h1 className="headline mt-3 text-3xl font-bold">Kontakt</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Fragen zu Konditionen, größeren Mengen oder einer laufenden Bestellung
        klären wir am schnellsten am Telefon. Bei Rückfragen zu einer Bestellung
        halten Sie bitte die Bestellnummer bereit.
      </p>

      <dl className="mt-10 divide-y divide-border rounded-lg border border-border">
        <Zeile icon={<Phone className="size-4" aria-hidden />} label="Telefon">
          {firma.phone && telefon ? (
            <a href={`tel:${telefon}`} className="hover:underline">
              {firma.phone}
            </a>
          ) : (
            "[TELEFON]"
          )}
        </Zeile>
        <Zeile icon={<Mail className="size-4" aria-hidden />} label="E-Mail">
          {firma.email ? (
            <a href={`mailto:${firma.email}`} className="hover:underline">
              {firma.email}
            </a>
          ) : (
            "[E-MAIL]"
          )}
        </Zeile>
        <Zeile icon={<MapPin className="size-4" aria-hidden />} label="Anschrift und Abholung">
          {firma.company_name ? <span className="block">{firma.company_name}</span> : null}
          {anschrift ?? "[STRASSE, PLZ ORT]"}
        </Zeile>
        {firma.website ? (
          <Zeile icon={<Globe className="size-4" aria-hidden />} label="Webseite">
            <a
              href={firma.website.startsWith("http") ? firma.website : `https://${firma.website}`}
              className="hover:underline"
              rel="noopener"
            >
              {firma.website}
            </a>
          </Zeile>
        ) : null}
      </dl>

      <p className="mt-8 text-sm text-muted-foreground">
        Viele Fragen zu Konto, Preisen und Lieferung beantworten die{" "}
        <Link href="/faq" className="font-medium text-brand hover:underline">
          häufigen Fragen
        </Link>
        ; Versandkosten und Abholung stehen unter{" "}
        <Link href="/versand" className="font-medium text-brand hover:underline">
          Versand
        </Link>
        .
      </p>
    </div>
  );
}

function Zeile({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 px-4 py-4">
      <span className="mt-0.5 text-gold">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words font-medium">{children}</dd>
      </div>
    </div>
  );
}

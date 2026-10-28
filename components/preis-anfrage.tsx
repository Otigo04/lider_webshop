import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preisAnfrageLink } from "@/lib/preisanfrage";

/**
 * Kaufbereich eines Artikels mit „Preis auf Anfrage" (Migration 077), statt
 * Preis, Staffeln und Warenkorb. Der Knopf öffnet eine neue Mail an die
 * Kontaktadresse, mit Artikelname und -nummer im Text.
 */
export function PreisAnfrage({
  name,
  sku,
  email,
  phone,
}: {
  name: string;
  sku: string;
  email: string | null | undefined;
  phone?: string | null;
}) {
  const link = preisAnfrageLink(email, name, sku);

  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border bg-muted p-5">
        <p className="eyebrow text-muted-foreground">Preis</p>
        <p className="mt-2 text-2xl font-bold">Preis auf Anfrage</p>
      </div>
      <div className="p-5">
        <p className="text-sm text-muted-foreground">
          Für diesen Artikel nennen wir den Preis persönlich. Schreiben Sie uns kurz
          Ihre gewünschte Menge – wir melden uns mit Ihrem Preis.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            {link.startsWith("mailto:") ? (
              <a href={link}>
                <Mail className="size-4" aria-hidden /> Preis anfragen
              </a>
            ) : (
              <Link href={link}>
                <Mail className="size-4" aria-hidden /> Preis anfragen
              </Link>
            )}
          </Button>
          {phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                <Phone className="size-4" aria-hidden /> {phone}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

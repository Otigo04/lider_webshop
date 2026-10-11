import Link from "next/link";
import { Store, Truck } from "lucide-react";
import { formatThreshold } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export interface ProductFact {
  label: string;
  value: React.ReactNode;
}

/**
 * Artikeldaten als Beschreibungsliste (Artikelnummer, Barcode, Kategorie …).
 * Zeilen ohne Wert werden vom Aufrufer gar nicht erst übergeben – eine leere
 * Zeile mit „–" wäre nur Rauschen.
 */
export function ProductFacts({
  facts,
  className,
}: {
  facts: ProductFact[];
  className?: string;
}) {
  if (facts.length === 0) return null;

  return (
    <section aria-labelledby="artikeldaten" className={className}>
      <h2 id="artikeldaten" className="text-sm font-semibold">
        Artikeldaten
      </h2>
      <dl className="mt-2 rounded-md border border-border">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-baseline gap-4 border-b border-border px-4 py-2 text-sm last:border-0"
          >
            <dt className="w-40 shrink-0 text-muted-foreground">{fact.label}</dt>
            <dd className="min-w-0 break-words font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Lieferhinweis unter dem Kaufblock. Die Zahl kommt aus den Firmendaten
 * (free_shipping_threshold) und steht nicht im Text – ändert der Betreiber sie
 * unter /admin/settings, stimmt auch diese Karte (siehe app/versand/page.tsx).
 */
export function ProductDelivery({
  freeShippingThreshold,
  className,
}: {
  freeShippingThreshold: number;
  className?: string;
}) {
  const frei =
    freeShippingThreshold <= 0
      ? "Versand kostenfrei."
      : `Versandkostenfrei ab ${formatThreshold(freeShippingThreshold)} netto Warenwert.`;

  return (
    <ul
      className={cn(
        "space-y-3 rounded-md border border-border bg-muted/40 p-4 text-sm",
        className,
      )}
    >
      <li className="flex items-start gap-3">
        <Truck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          <span className="font-medium">Lieferung an Ihre Adresse.</span>{" "}
          <span className="text-muted-foreground">{frei}</span>
        </span>
      </li>
      <li className="flex items-start gap-3">
        <Store className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          <span className="font-medium">Selbstabholung in Berlin</span>{" "}
          <span className="text-muted-foreground">
            ist bei jeder Bestellung möglich.{" "}
          </span>
          <Link href="/versand" className="underline underline-offset-2 hover:text-foreground">
            Mehr zu Versand und Ablauf
          </Link>
        </span>
      </li>
    </ul>
  );
}

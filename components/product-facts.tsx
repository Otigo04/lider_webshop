import Link from "next/link";
import { ChevronDown, Store, Truck } from "lucide-react";
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

  // Eingeklappt: die Angaben sind Nachschlagewerk, keine Kaufentscheidung.
  // Der Preis und der Knopf sollen auf der Seite allein stehen.
  return (
    <details className={cn("group border-t border-border pt-4", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        Artikeldaten
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <dl className="mt-3 space-y-1.5 text-sm">
        {facts.map((fact) => (
          <div key={fact.label} className="flex gap-4">
            <dt className="w-44 shrink-0 text-muted-foreground">{fact.label}</dt>
            <dd className="min-w-0 break-words">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </details>
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
        "space-y-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <li className="flex items-start gap-3">
        <Truck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Lieferung an Ihre Adresse.</span>{" "}
          {frei}
        </span>
      </li>
      <li className="flex items-start gap-3">
        <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Selbstabholung in Berlin</span>{" "}
          ist bei jeder Bestellung möglich.{" "}
          <Link href="/versand" className="underline underline-offset-2 hover:text-foreground">
            Mehr zu Versand und Ablauf
          </Link>
        </span>
      </li>
    </ul>
  );
}

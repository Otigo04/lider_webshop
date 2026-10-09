import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PapierkorbKnoepfe } from "@/components/admin/papierkorb-zeile";
import { formatQuantity } from "@/lib/format";
import { getDeletedProducts } from "@/lib/queries/papierkorb";

export const metadata: Metadata = { title: "Papierkorb" };

const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Gelöschte Artikel. Zurückgeholt wird mit Staffeln, Merkmalen, Flags,
 * Einkaufspreis, Katalogauswahl und Fotos – so, wie der Artikel war. Nicht
 * zurück kommen die Verknüpfungen in Journal, Bons und Bestellungen; dort
 * steht der Name als Schnappschuss.
 */
export default async function PapierkorbPage() {
  const artikel = await getDeletedProducts();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/products"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Artikel
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Papierkorb</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gelöschte Artikel bleiben hier liegen, bis du sie endgültig löschst.
          Ist die Artikelnummer oder der Barcode inzwischen anderweitig
          vergeben, lässt sich der Artikel erst nach einer Änderung zurückholen.
        </p>
      </div>

      {artikel.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Der Papierkorb ist leer.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Artikel</th>
                <th className="py-2 pr-3 text-right font-medium">Bestand</th>
                <th className="py-2 pr-3 font-medium">Gelöscht</th>
                <th className="py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {artikel.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="block font-medium">{a.name}</span>
                    <span className="code text-xs text-muted-foreground">
                      {a.sku}
                      {a.barcode ? ` · ${a.barcode}` : ""}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
                    {a.bestand === null ? "–" : formatQuantity(a.bestand)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular">
                    {ZEITPUNKT.format(new Date(a.geloeschtAm))}
                    {a.von ? (
                      <span className="block text-xs">{a.von}</span>
                    ) : null}
                  </td>
                  <td className="py-2.5">
                    <PapierkorbKnoepfe id={a.id} name={a.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ImageOff, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, formatQuantity } from "@/lib/format";
import { getProductGroups } from "@/lib/queries/groups";

export const metadata: Metadata = { title: "Ausführungen" };

/**
 * Artikelgruppen (Migration 033).
 *
 * Eine Gruppe bündelt, was im Shop **ein** Angebot ist: dieselbe Lampe in
 * 60 W und 100 W, dasselbe Regal in drei Farben. Jede Ausführung bleibt ein
 * ganz normaler Artikel mit eigener Nummer, eigenem Barcode, eigenem Bestand –
 * und taucht deshalb auch in der Artikelliste, an der Kasse und im
 * Wareneingang ganz normal auf. Hier steht nur die Klammer darum.
 */
export default async function AdminGruppenPage() {
  const gruppen = await getProductGroups();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ausführungen</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Artikel, die im Shop ein Angebot mit Auswahl bilden – Farbe,
            Wattzahl, Größe. Jede Ausführung bleibt ein eigener Artikel mit
            eigenem Preis und eigenem Bestand; gebündelt wird nur, was der
            Kunde als eine Entscheidung sieht.
          </p>
        </div>

        <Button asChild>
          <Link href="/admin/gruppen/new">
            <Plus className="size-4" aria-hidden /> Neues Angebot
          </Link>
        </Button>
      </div>

      {gruppen.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <Layers
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein Angebot mit Ausführungen. Kreuzen Sie im Generator die
            Merkmalswerte an – aus zwei Farben und zwei Wattzahlen werden vier
            Artikel auf einmal.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/gruppen/new">Zum Generator</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Angebot</th>
                <th className="py-2 pr-3 font-medium">Warengruppe</th>
                <th className="py-2 pr-3 text-right font-medium">Ausführungen</th>
                <th className="py-2 pr-3 text-right font-medium">ab</th>
                <th className="py-2 font-medium">Hinweis</th>
              </tr>
            </thead>
            <tbody>
              {gruppen.map((gruppe) => (
                <tr
                  key={gruppe.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`/admin/gruppen/${gruppe.id}`}
                      className="font-medium hover:underline"
                    >
                      {gruppe.name}
                    </Link>
                    {gruppe.description ? (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {gruppe.description}
                      </p>
                    ) : null}
                  </td>

                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {gruppe.categoryNames.join(", ") || "—"}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular">
                    {formatQuantity(gruppe.memberCount)}
                  </td>

                  <td className="py-2.5 pr-3 text-right tabular">
                    {gruppe.priceFrom !== null
                      ? formatPrice(gruppe.priceFrom)
                      : "—"}
                  </td>

                  <td className="py-2.5">
                    {/* Ohne Foto steht ein Artikel nicht im Sortiment
                        (Migration 020). Bei einem Bündel fällt das sonst nicht
                        auf: die Kachel ist ja da, nur eine Ausführung fehlt
                        still in der Auswahl. */}
                    {gruppe.ohneBild > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                        <ImageOff className="size-3.5" aria-hidden />
                        {formatQuantity(gruppe.ohneBild)} ohne Foto – im Shop
                        nicht wählbar
                      </span>
                    ) : gruppe.memberCount < 2 ? (
                      <span className="text-xs text-muted-foreground">
                        Erst ab zwei Ausführungen erscheint eine Auswahl.
                      </span>
                    ) : null}
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

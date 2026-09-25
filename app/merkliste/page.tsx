import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ProductGrid } from "@/components/product-grid";
import { PublicProductGrid } from "@/components/public-product-grid";
import { getCurrentUser } from "@/lib/auth";
import { MERKLISTE_COOKIE, parseMerkliste } from "@/lib/merkliste";
import { getProducts, getPublicProducts } from "@/lib/queries/products";

export const metadata: Metadata = {
  title: "Merkliste",
  robots: { index: false },
};

/**
 * Gemerkte Artikel (lib/merkliste.ts).
 *
 * Offen für alle wie das Sortiment: gemerkt wird schon vor der Anmeldung.
 * Angemeldete Kunden sehen dieselben Karten wie im Shop, mit Preisen und
 * Bestand; Besucher die Schaufensterkarte.
 *
 * Reihenfolge wie gemerkt, neueste zuerst – nicht nach Name. Wer gerade
 * etwas gemerkt hat, sucht es oben.
 */
export default async function MerklistePage() {
  const ids = parseMerkliste((await cookies()).get(MERKLISTE_COOKIE)?.value);
  const user = await getCurrentUser();
  const istKunde = Boolean(user?.is_active);

  const rang = new Map(ids.map((id, i) => [id, i]));
  const nachRang = <T extends { id: string }>(liste: T[]) =>
    [...liste].sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));

  const leer = "Noch nichts gemerkt. Das Herz auf einer Artikelkachel setzt einen Artikel hierher.";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-gold">Vorgemerkt</p>
          <h1 className="headline mt-3 text-3xl font-bold">Merkliste</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Gespeichert in diesem Browser. Artikel, die nicht mehr im Sortiment
            sind, fallen von selbst heraus.
          </p>
        </div>
        <Link
          href="/shop"
          className="text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Zum Sortiment
        </Link>
      </div>

      <div className="mt-8">
        {ids.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {leer}
          </p>
        ) : istKunde ? (
          <ProductGrid products={nachRang(await getProducts({ ids }))} emptyMessage={leer} />
        ) : (
          <PublicProductGrid
            products={nachRang(await getPublicProducts({ ids }))}
            emptyMessage={leer}
          />
        )}
      </div>
    </div>
  );
}

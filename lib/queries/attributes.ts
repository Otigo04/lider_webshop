import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductAttributeGroup,
  ProductAttributeValue,
} from "@/lib/types";

/**
 * Merkmale von Artikeln (Migration 032).
 *
 * Gelesen werden darf frei – die Tabellen tragen weder Preise noch Bestände,
 * und die Artikelseite zeigt Farbe und Größe auch Besuchern ohne Konto. Der
 * Sitzungsclient reicht deshalb überall aus.
 */

/**
 * Alle Merkmale mit ihren Werten, in Pflegereihenfolge.
 *
 * Ein Aufruf statt zwei: die Werte hängen ohne ihr Merkmal in der Luft, und
 * die Oberfläche zeigt sie nirgends getrennt an.
 */
export async function getProductAttributes(): Promise<ProductAttributeGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_attributes")
    .select(
      "*, values:product_attribute_values (id, attribute_id, label, hex, order_index, created_at)",
    )
    .order("order_index")
    .order("name");

  if (error) {
    console.error("[katalog] Merkmale:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const gruppe = row as unknown as ProductAttributeGroup;
    return {
      ...gruppe,
      // PostgREST sortiert eingebettete Zeilen nicht mit – die Reihenfolge der
      // Werte trägt aber Bedeutung (S, M, L und nicht L, M, S).
      values: [...(gruppe.values ?? [])].sort(
        (a, b) =>
          a.order_index - b.order_index || a.label.localeCompare(b.label, "de"),
      ),
    };
  });
}

/** Die gesetzten Werte eines einzelnen Artikels – für Formular und Artikelseite. */
export async function getProductAttributeValueIds(
  productId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_attribute_links")
    .select("value_id")
    .eq("product_id", productId);

  if (error) {
    console.error("[katalog] Merkmale des Artikels:", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.value_id as string);
}

/**
 * Zuordnungen für mehrere Artikel auf einmal.
 *
 * Die Artikelliste zeigt die Merkmale in jeder Zeile; ein Aufruf je Artikel
 * wären bei 200 Artikeln 200 Abfragen. Der Rückgabewert ist nach Artikel-ID
 * geschlüsselt, damit die Liste ihn direkt nachschlagen kann.
 */
export async function getProductAttributeMap(
  productIds: string[],
): Promise<Map<string, string[]>> {
  const karte = new Map<string, string[]>();
  if (productIds.length === 0) return karte;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_attribute_links")
    .select("product_id, value_id")
    .in("product_id", productIds);

  if (error) {
    console.error("[katalog] Merkmale mehrerer Artikel:", error.message);
    return karte;
  }

  for (const row of data ?? []) {
    const id = row.product_id as string;
    karte.set(id, [...(karte.get(id) ?? []), row.value_id as string]);
  }
  return karte;
}

/**
 * Artikel-IDs zu einer Merkmalsauswahl.
 *
 * `nachMerkmal` enthält je Merkmal die angehakten Werte. Innerhalb eines
 * Merkmals gilt ODER, zwischen den Merkmalen UND: wer bei Farbe „rot" und
 * „blau" anhakt, will beides sehen – hakt er zusätzlich bei Größe „XL" an,
 * will er nur die roten und blauen XL-Stücke. Ein durchgehendes UND fände
 * nichts, was gleichzeitig rot *und* blau ist; ein durchgehendes ODER
 * verlängerte die Liste mit jedem Haken statt sie zu kürzen.
 *
 * Gefiltert wird über die Zuordnungstabelle statt über einen Join am
 * Katalog: die Artikelabfragen unterscheiden sich je nach Anmeldestatus
 * (products bzw. products_public), die Zuordnung ist für beide dieselbe.
 */
export async function getProductIdsByValues(
  nachMerkmal: string[][],
): Promise<Set<string> | null> {
  const gruppen = nachMerkmal.filter((werte) => werte.length > 0);
  if (gruppen.length === 0) return null; // kein Filter gesetzt

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_attribute_links")
    .select("product_id, value_id")
    .in("value_id", gruppen.flat());

  if (error) {
    console.error("[katalog] Merkmalsfilter:", error.message);
    return new Set();
  }

  const treffer = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const id = row.product_id as string;
    const menge = treffer.get(id) ?? new Set<string>();
    menge.add(row.value_id as string);
    treffer.set(id, menge);
  }

  const ergebnis = new Set<string>();
  for (const [productId, werte] of treffer) {
    if (gruppen.every((gruppe) => gruppe.some((wert) => werte.has(wert)))) {
      ergebnis.add(productId);
    }
  }
  return ergebnis;
}

/** Flache Liste aller Werte – zum Auflösen von IDs aus der Adresszeile. */
export function flacheWerte(
  gruppen: ProductAttributeGroup[],
): Map<string, ProductAttributeValue> {
  const karte = new Map<string, ProductAttributeValue>();
  for (const gruppe of gruppen) {
    for (const wert of gruppe.values) karte.set(wert.id, wert);
  }
  return karte;
}

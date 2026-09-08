import "server-only";
import type { ProductFlag } from "@/lib/actions/admin-products";
import { getCurrentUser } from "@/lib/auth";
import { lowestUnitPrice, minOrderQuantity, freeStock } from "@/lib/pricing";
import { istNeu } from "@/lib/product-flags";
import { gruppiere } from "@/lib/product-groups";
import {
  getProductAttributes,
  getProductIdsByValues,
} from "@/lib/queries/attributes";
import {
  getCategories,
  getCategoryCounts,
  getProducts,
  getPublicProducts,
  type ProductListItem,
  type PublicProductListItem,
} from "@/lib/queries/products";
import {
  applyShopFilters,
  parseShopFilters,
  seitenAusschnitt,
  type FilterAdapter,
  type ShopFilters,
} from "@/lib/shop-filters";
import type { FilterCategory } from "@/components/shop-filter-panel";
import type { ProductAttributeGroup } from "@/lib/types";

/**
 * Gemeinsamer Unterbau der drei Sortiments-Routen (/shop, /shop/[category],
 * /shop/neuheiten, /shop/topseller).
 *
 * Die Routen unterscheiden sich nur in Kategorie und Flag; alles andere –
 * Anmeldestatus, Kategoriezählung, Filter, Sortierung – ist identisch und
 * stand vorher viermal fast gleich in den Seiten.
 */

const KUNDE: FilterAdapter<ProductListItem> = {
  name: (p) => p.name,
  price: (p) => lowestUnitPrice(p.variants),
  minQuantity: (p) => minOrderQuantity(p.variants),
  isNew: (p) => istNeu(p),
  isTopseller: (p) => p.is_topseller,
  stock: (p) => freeStock(p),
};

const BESUCHER: FilterAdapter<PublicProductListItem> = {
  name: (p) => p.name,
  price: (p) => p.priceFrom,
  minQuantity: (p) => p.minOrderQuantity,
  isNew: (p) => istNeu(p),
  isTopseller: (p) => p.is_topseller,
  // Bestände sind ohne Login nicht sichtbar – der Filter entfällt dort.
  stock: () => null,
};

interface ShopPageOptions {
  searchParams: Record<string, string | string[] | undefined>;
  categoryId?: string;
  flag?: ProductFlag;
}

export interface ShopPageData {
  /** Angemeldeter, aktiver Kunde? Bestimmt Preise, Bestände und Warenkorb */
  istKunde: boolean;
  filters: ShopFilters;
  categories: FilterCategory[];
  /** Gepflegte Merkmale für die Filterspalte; leer, solange keine da sind */
  attributes: ProductAttributeGroup[];
  totalCount: number;
  /** Treffer nach Filtern und Suche, über alle Seiten */
  gefunden: number;
  seite: number;
  seitenGesamt: number;
  /**
   * Gibt es überhaupt Artikel mit einer Mindestabnahme über 1 Stück? Ist die
   * Antwort nein, sind Mengenfilter und Mengensortierung im Sortiment nur
   * Kästchen ohne Wirkung.
   */
  mengenstaffeln: boolean;
  /** Nur die Artikel der aktuellen Seite */
  kundenArtikel: ProductListItem[];
  besucherArtikel: PublicProductListItem[];
}

export async function loadShopPage({
  searchParams,
  categoryId,
  flag,
}: ShopPageOptions): Promise<ShopPageData> {
  const filters = parseShopFilters(searchParams);
  const user = await getCurrentUser();
  // Deaktivierte Kunden sehen das Schaufenster wie anonyme Besucher – RLS
  // gäbe ihnen bei der Kundenansicht ohnehin nur leere Ergebnisse.
  const istKunde = Boolean(user?.is_active);

  // "Zuletzt aufgenommen" muss aus der Datenbank kommen, das Aufnahmedatum
  // steht in den Listen nicht zur Verfügung.
  const orderBy = filters.sort === "neu" ? "created_at" : undefined;

  const [categories, counts, attributes] = await Promise.all([
    getCategories(),
    getCategoryCounts({ flag }),
    getProductAttributes(),
  ]);

  /*
   * Merkmalsfilter. Die angehakten Werte werden nach ihrem Merkmal gruppiert,
   * damit „rot" und „blau" als Oder gelten und „rot" und „XL" als Und – zwei
   * Farben anzuhaken soll die Liste verlängern, eine Größe dazu sie kürzen
   * (siehe getProductIdsByValues).
   *
   * null heißt „kein Merkmalsfilter gesetzt" und ist nicht dasselbe wie eine
   * leere Menge: die hieße „nichts trifft zu" und räumte das Sortiment leer.
   */
  const gewaehlt = new Set(filters.attributeValues);
  const nachMerkmal = attributes
    .map((attribut) =>
      attribut.values.filter((wert) => gewaehlt.has(wert.id)).map((w) => w.id),
    )
    .filter((werte) => werte.length > 0);
  const erlaubteIds = await getProductIdsByValues(nachMerkmal);
  const nachMerkmalen = <T extends { id: string }>(items: T[]): T[] =>
    erlaubteIds === null ? items : items.filter((item) => erlaubteIds.has(item.id));

  const mitZahlen: FilterCategory[] = categories.map((category) => ({
    ...category,
    productCount: counts.get(category.id) ?? 0,
  }));
  const totalCount = [...counts.values()].reduce((summe, n) => summe + n, 0);

  if (!istKunde) {
    const artikel = await getPublicProducts({
      categoryId,
      flag,
      search: filters.search,
      orderBy,
    });
    const seite = seitenAusschnitt(
      // Erst filtern und sortieren, dann falten: so vertritt die Kachel eine
      // Ausführung, die zum Filter passt (wer „rot" anhakt, sieht die rote),
      // und die Reihenfolge bleibt die gewählte.
      gruppiere(applyShopFilters(nachMerkmalen(artikel), filters, BESUCHER)),
      filters.page,
    );
    return {
      istKunde,
      filters,
      categories: mitZahlen,
      attributes,
      totalCount,
      mengenstaffeln: artikel.some((p) => (BESUCHER.minQuantity(p) ?? 1) > 1),
      gefunden: seite.gefunden,
      seite: seite.seite,
      seitenGesamt: seite.seitenGesamt,
      kundenArtikel: [],
      besucherArtikel: seite.artikel,
    };
  }

  const artikel = await getProducts({
    categoryId,
    flag,
    search: filters.search,
    orderBy,
  });

  const seite = seitenAusschnitt(
    gruppiere(applyShopFilters(nachMerkmalen(artikel), filters, KUNDE)),
    filters.page,
  );

  return {
    istKunde,
    filters,
    categories: mitZahlen,
    attributes,
    totalCount,
    mengenstaffeln: artikel.some((p) => (KUNDE.minQuantity(p) ?? 1) > 1),
    gefunden: seite.gefunden,
    seite: seite.seite,
    seitenGesamt: seite.seitenGesamt,
    kundenArtikel: seite.artikel,
    besucherArtikel: [],
  };
}

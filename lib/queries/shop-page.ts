import "server-only";
import type { ProductFlag } from "@/lib/actions/admin-products";
import { getCurrentUser } from "@/lib/auth";
import { lowestUnitPrice, minOrderQuantity, freeStock } from "@/lib/pricing";
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
  type FilterAdapter,
  type ShopFilters,
} from "@/lib/shop-filters";
import type { FilterCategory } from "@/components/shop-filter-panel";

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
  isNew: (p) => p.is_new,
  isTopseller: (p) => p.is_topseller,
  stock: (p) => freeStock(p),
};

const BESUCHER: FilterAdapter<PublicProductListItem> = {
  name: (p) => p.name,
  price: (p) => p.priceFrom,
  minQuantity: (p) => p.minOrderQuantity,
  isNew: (p) => p.is_new,
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
  totalCount: number;
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

  const [categories, counts] = await Promise.all([
    getCategories(),
    getCategoryCounts({ flag }),
  ]);

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
    return {
      istKunde,
      filters,
      categories: mitZahlen,
      totalCount,
      kundenArtikel: [],
      besucherArtikel: applyShopFilters(artikel, filters, BESUCHER),
    };
  }

  const artikel = await getProducts({
    categoryId,
    flag,
    search: filters.search,
    orderBy,
  });

  return {
    istKunde,
    filters,
    categories: mitZahlen,
    totalCount,
    kundenArtikel: applyShopFilters(artikel, filters, KUNDE),
    besucherArtikel: [],
  };
}

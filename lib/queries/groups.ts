import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getImageUrls } from "@/lib/storage";
import { freeStock, lowestUnitPrice } from "@/lib/pricing";
import { firstImagePath } from "@/lib/queries/products";
import type {
  Product,
  ProductGroup,
  ProductImage,
  ProductVariant,
} from "@/lib/types";

/**
 * Artikelgruppen (Migration 033).
 *
 * Eine Gruppe ist nur der gemeinsame Titel; alles Kaufmännische hängt an ihren
 * Mitgliedern. Die Abfragen hier laden deshalb fast immer beides zusammen –
 * eine Gruppe ohne ihre Ausführungen sagt nichts aus.
 */

/** Eine Ausführung, wie die Verwaltung sie in der Tabelle zeigt. */
export interface GroupMember extends Product {
  variants: ProductVariant[];
  images: ProductImage[];
  /** Günstigste Staffel; null, wenn keine gepflegt ist */
  unitPrice: number | null;
  /** Bestand minus Reservierungen offener Bestellungen */
  free: number;
  /** Merkmalswerte dieser Ausführung – „rot", „60 W" */
  valueIds: string[];
  /** Signierte URL des Titelbilds, null ohne Foto */
  imageUrl: string | null;
}

export interface GroupDetail extends ProductGroup {
  members: GroupMember[];
}

/** Eine Zeile der Gruppenliste in der Verwaltung. */
export interface GroupListItem extends ProductGroup {
  memberCount: number;
  /** Warengruppen, in denen die Ausführungen liegen – meist genau eine */
  categoryNames: string[];
  /** Günstigster Preis über alle Ausführungen */
  priceFrom: number | null;
  /** Ausführungen ohne Foto sind im Shop unsichtbar (Migration 020) */
  ohneBild: number;
}

const MEMBER_COLUMNS = `
  *,
  category:categories (id, name),
  variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at),
  images:product_images (id, product_id, file_path, display_order, created_at)
`;

/**
 * Rohzeile aus PostgREST. `Omit`, weil eingebettete Listen dort als null
 * ankommen können, während `Product` sie als „nicht mitgeladen" (undefined)
 * führt – zwei verschiedene Aussagen, die sich nicht überschreiben lassen.
 */
type MemberRow = Omit<Product, "variants" | "images"> & {
  variants: ProductVariant[] | null;
  images: ProductImage[] | null;
};

/**
 * Alle Gruppen mit Kennzahlen für die Übersicht.
 *
 * Zwei Abfragen statt eines Joins mit Aggregat: PostgREST kann zwar zählen,
 * aber nicht gleichzeitig den günstigsten Preis über die Staffeln der
 * Mitglieder bilden – der liegt eine Ebene tiefer. Bei der Zahl an Gruppen,
 * die ein Laden führt, ist das kein Thema.
 */
export async function getProductGroups(): Promise<GroupListItem[]> {
  const supabase = await createClient();

  const [{ data: gruppen, error }, { data: mitglieder }] = await Promise.all([
    supabase.from("product_groups").select("*").order("name"),
    supabase
      .from("products")
      .select(
        `id, group_id, has_image,
         category:categories (name),
         variants:product_variants (unit_price)`,
      )
      .not("group_id", "is", null),
  ]);

  if (error) {
    console.error("[admin] Artikelgruppen:", error.message);
    return [];
  }

  const nachGruppe = new Map<
    string,
    { anzahl: number; kategorien: Set<string>; preise: number[]; ohneBild: number }
  >();

  for (const row of (mitglieder ?? []) as unknown as {
    group_id: string;
    has_image: boolean;
    category: { name: string } | null;
    variants: { unit_price: number | string }[] | null;
  }[]) {
    const eintrag = nachGruppe.get(row.group_id) ?? {
      anzahl: 0,
      kategorien: new Set<string>(),
      preise: [] as number[],
      ohneBild: 0,
    };
    eintrag.anzahl += 1;
    if (!row.has_image) eintrag.ohneBild += 1;
    if (row.category?.name) eintrag.kategorien.add(row.category.name);

    const guenstigster = lowestUnitPrice(
      (row.variants ?? []) as unknown as ProductVariant[],
    );
    if (guenstigster !== null) eintrag.preise.push(guenstigster);

    nachGruppe.set(row.group_id, eintrag);
  }

  return ((gruppen ?? []) as ProductGroup[]).map((gruppe) => {
    const eintrag = nachGruppe.get(gruppe.id);
    return {
      ...gruppe,
      memberCount: eintrag?.anzahl ?? 0,
      categoryNames: [...(eintrag?.kategorien ?? [])].sort((a, b) =>
        a.localeCompare(b, "de"),
      ),
      priceFrom: eintrag?.preise.length ? Math.min(...eintrag.preise) : null,
      ohneBild: eintrag?.ohneBild ?? 0,
    };
  });
}

/** Eine Gruppe mit allen Ausführungen – für die Bearbeitungsseite. */
export async function getProductGroup(id: string): Promise<GroupDetail | null> {
  const supabase = await createClient();

  const { data: gruppe, error } = await supabase
    .from("product_groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin] Artikelgruppe:", error.message);
    return null;
  }
  if (!gruppe) return null;

  const { data: rows } = await supabase
    .from("products")
    .select(MEMBER_COLUMNS)
    .eq("group_id", id)
    .order("sku");

  const mitglieder = (rows ?? []) as unknown as MemberRow[];

  // Merkmalswerte und Titelbilder in je einem Rutsch – sonst je Ausführung
  // eine eigene Abfrage beziehungsweise eine eigene Signatur.
  const { data: links } = await supabase
    .from("product_attribute_links")
    .select("product_id, value_id")
    .in(
      "product_id",
      mitglieder.length > 0 ? mitglieder.map((m) => m.id) : ["00000000-0000-0000-0000-000000000000"],
    );

  const werte = new Map<string, string[]>();
  for (const link of links ?? []) {
    const pid = link.product_id as string;
    werte.set(pid, [...(werte.get(pid) ?? []), link.value_id as string]);
  }

  const urls = await getImageUrls(
    mitglieder.map((m) => firstImagePath(m.images ?? [])),
  );

  return {
    ...(gruppe as ProductGroup),
    members: mitglieder.map((row, index) => ({
      ...row,
      variants: row.variants ?? [],
      images: row.images ?? [],
      unitPrice: lowestUnitPrice(row.variants ?? []),
      free: freeStock(row),
      valueIds: werte.get(row.id) ?? [],
      imageUrl: urls[index],
    })),
  };
}

/**
 * Die Geschwister einer Ausführung für die Artikelseite.
 *
 * `is_active` und `has_image` wie überall im Sortiment (Migration 020): ein
 * Auswahlknopf, der auf eine Seite führt, die es für Kunden nicht gibt, wäre
 * schlimmer als ein fehlender Knopf. Welche Ausführungen deshalb unsichtbar
 * bleiben, steht in der Verwaltung an der Gruppe.
 */
export async function getGroupSiblings(groupId: string): Promise<
  {
    id: string;
    name: string;
    valueIds: string[];
    free: number;
    unitPrice: number | null;
  }[]
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `id, name, stock_available, stock_reserved,
       variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at)`,
    )
    .eq("group_id", groupId)
    .eq("is_active", true)
    .eq("has_image", true)
    .order("sku");

  if (error) {
    console.error("[katalog] Ausführungen:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    stock_available: number;
    stock_reserved: number;
    variants: ProductVariant[] | null;
  }[];
  if (rows.length === 0) return [];

  const { data: links } = await supabase
    .from("product_attribute_links")
    .select("product_id, value_id")
    .in("product_id", rows.map((row) => row.id));

  const werte = new Map<string, string[]>();
  for (const link of links ?? []) {
    const pid = link.product_id as string;
    werte.set(pid, [...(werte.get(pid) ?? []), link.value_id as string]);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    valueIds: werte.get(row.id) ?? [],
    free: freeStock(row),
    unitPrice: lowestUnitPrice(row.variants ?? []),
  }));
}

/** Nur Name und ID – für das Zuordnungsfeld im Artikelformular. */
export async function getGroupOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_groups")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("[admin] Gruppenauswahl:", error.message);
    return [];
  }
  return (data ?? []) as { id: string; name: string }[];
}

import "server-only";
import type { ProductFlag } from "@/lib/actions/admin-products";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getImageUrls } from "@/lib/storage";
import { NEU_TAGE, istNeu } from "@/lib/product-flags";
import { reduzierung } from "@/lib/pricing";
import { gruppiere } from "@/lib/product-groups";
import type {
  Category,
  Product,
  ProductImage,
  ProductVariant,
} from "@/lib/types";

/**
 * Client, mit dem Katalogabfragen laufen können: der Sitzungsclient für alles
 * hinter der Anmeldung, der sitzungslose für den öffentlichen Katalog.
 */
type KatalogClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createPublicClient>;

/**
 * Lesezugriffe auf den Katalog. Alles läuft über den Session-Client, damit RLS
 * greift – ein deaktivierter Kunde bekommt hier schlicht leere Ergebnisse.
 */

export interface ProductListItem extends Product {
  variants: ProductVariant[];
  /** Signierte URL des ersten Fotos, null wenn keins hinterlegt ist */
  imageUrl: string | null;
  /**
   * Wie viele Ausführungen dieses Angebots die Kachel vertritt (Migration
   * 033). Gesetzt von gruppiere(); 1 oder fehlend heißt: einzelner Artikel.
   */
  ausfuehrungen?: number;
}

/**
 * Schaufenster-Ansicht für nicht angemeldete Besucher: kommt aus der View
 * `products_public` (siehe migrations/006), die bewusst weder Bestand noch
 * Preise enthält.
 */
export interface PublicProductListItem {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description: string | null;
  is_new: boolean;
  is_topseller: boolean;
  /** Aufnahmedatum – trägt zusammen mit is_new das Neu-Label (lib/product-flags.ts) */
  created_at: string;
  imageUrl: string | null;
  /**
   * Günstigster Stückpreis für die "ab"-Angabe. Kommt aus der View
   * product_price_range (Migration 013) – die einzelnen Staffeln bleiben
   * angemeldeten Kunden vorbehalten. null, solange die Migration nicht
   * eingespielt ist oder der Artikel keine Preise hat.
   */
  priceFrom: number | null;
  minOrderQuantity: number | null;
  /**
   * Vorher-Preis für die Rabattanzeige (Migration 023). Anders als der
   * Ladenpreis steht er auch im Schaufenster: eine Reduzierung ist eine
   * Werbeaussage und gehört nach außen.
   */
  list_price: number | null;
  /** Artikelgruppe (Migration 033), null bei einem Artikel ohne Ausführungen */
  group_id: string | null;
  /**
   * Name der Gruppe. Die Karte zeigt ihn statt der Bezeichnung der einzelnen
   * Ausführung: im Sortiment steht „LED-Lampe E27" und nicht „LED-Lampe E27
   * 60 W warmweiß", sonst stünde dort viermal fast dasselbe.
   */
  groupName: string | null;
  /** Vertretene Ausführungen; 1 oder fehlend = einzelner Artikel */
  ausfuehrungen?: number;
}

/**
 * Rohzeile aus `products_public`. Ausgeschrieben statt durchgereichter
 * PostgREST-Typen: die Landingpage rechnet mit diesen Feldern (Neu-Regel,
 * Schaufenster, Querschnitt), und `Record<string, unknown>` macht daraus
 * lauter Zwischencasts.
 */
interface PublicRow {
  id: string;
  category_id: string;
  group_id: string | null;
  sku: string;
  name: string;
  description: string | null;
  is_new: boolean;
  is_topseller: boolean;
  created_at: string;
  list_price: number | null;
}

let viewFehltGemeldet = false;

interface PriceRangeRow {
  min_unit_price: number;
  min_order_quantity: number;
}

/**
 * "Ab"-Preise für eine Menge Artikel. Fehlt die View noch, wird das einmal
 * geloggt und die Seite zeigt weiter "Preis nach Anmeldung" – kein Grund,
 * das ganze Schaufenster scheitern zu lassen.
 */
async function priceRangesFor(
  supabase: KatalogClient,
  ids: string[],
): Promise<Map<string, PriceRangeRow>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_price_range")
    .select("product_id, min_unit_price, min_order_quantity")
    .in("product_id", ids);

  if (error) {
    // Fehlt die View noch, wäre das sonst ein Fehler pro Seitenaufruf.
    if (error.code === "PGRST205") {
      if (!viewFehltGemeldet) {
        viewFehltGemeldet = true;
        console.warn(
          "[katalog] Ohne Migration 013 keine Ab-Preise – Seiten zeigen 'Preis nach Anmeldung'.",
        );
      }
    } else {
      console.error("[katalog] Ab-Preise:", error.message);
    }
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.product_id as string,
      {
        min_unit_price: Number(row.min_unit_price),
        min_order_quantity: Number(row.min_order_quantity),
      },
    ]),
  );
}

/** `category` ist hier immer geladen – deshalb null statt undefined. */
export interface ProductDetail extends Omit<Product, "category"> {
  variants: ProductVariant[];
  images: ProductImage[];
  category: Category | null;
  imageUrls: (string | null)[];
}

const LIST_COLUMNS = `
  id, category_id, group_id, sku, barcode, name, description, is_active, is_new, is_topseller, has_image,
  retail_price, list_price, stock_available, stock_reserved, created_by, created_at, updated_at,
  group:product_groups (id, name, description, created_by, created_at, updated_at),
  variants:product_variants (id, product_id, min_quantity, max_quantity, unit_price, created_at),
  images:product_images (id, product_id, file_path, display_order, created_at)
`;

/**
 * PostgREST trennt `or`-Bedingungen mit Komma und klammert mit (). Zeichen, die
 * dort Bedeutung haben, müssen raus, sonst lässt sich der Filter über das
 * Suchfeld manipulieren.
 */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()*\\%]/g, " ").trim();
}

/**
 * Filter für "Neuheiten". Das Flag allein reicht nicht: frisch aufgenommene
 * Artikel gelten drei Tage lang automatisch als neu (lib/product-flags.ts).
 * PostgREST verknüpft mehrere .or()-Aufrufe mit UND, der Suchfilter bleibt
 * also unberührt.
 */
function neuheitenFilter(seit: Date): string {
  return `is_new.eq.true,created_at.gte.${seit.toISOString()}`;
}

/** Beginn des Zeitfensters, in dem ein Artikel automatisch als neu gilt. */
function neuAb(): Date {
  return new Date(Date.now() - NEU_TAGE * 24 * 60 * 60 * 1000);
}

/**
 * Warengruppen. Der Client ist überschreibbar, weil die Landingpage sie ohne
 * Sitzung liest (siehe lib/supabase/public.ts).
 */
export async function getCategories(client?: KatalogClient): Promise<Category[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("order_index")
    .order("name");

  if (error) {
    console.error("[katalog] Kategorien:", error.message);
    return [];
  }
  return data as Category[];
}

/**
 * Artikel je Kategorie, für die Zahlen in der Filterspalte. Liest aus der
 * öffentlichen View: die Zählung soll auch ohne Login stimmen, und Preise
 * oder Bestände braucht sie nicht.
 */
export async function getCategoryCounts(options?: {
  flag?: ProductFlag;
}): Promise<Map<string, number>> {
  const supabase = await createClient();

  let query = supabase.from("products_public").select("id, category_id, group_id");
  if (options?.flag === "is_new") {
    query = query.or(neuheitenFilter(neuAb()));
  } else if (options?.flag) {
    query = query.eq(options.flag, true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[katalog] Kategoriezählung:", error.message);
    return new Map();
  }

  /*
   * Gezählt werden **Angebote**, nicht Artikel: eine Lampe in vier
   * Ausführungen ist im Sortiment eine Kachel und muss in der Filterspalte
   * auch als eine zählen. Stünde dort „12" und die Liste zeigte 6 Kacheln,
   * sähe das nach einem Fehler aus (siehe gruppiere() in lib/product-groups.ts).
   */
  const zaehler = new Map<string, number>();
  for (const row of gruppiere(
    (data ?? []) as unknown as { id: string; group_id: string | null }[],
  )) {
    const id = (row as unknown as { category_id: string }).category_id;
    zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
  }
  return zaehler;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Category) ?? null;
}

export async function getProducts(options?: {
  categoryId?: string;
  search?: string;
  flag?: ProductFlag;
  /** "created_at" liefert die zuletzt aufgenommenen zuerst; sonst nach Name */
  orderBy?: "created_at";
}): Promise<ProductListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(LIST_COLUMNS)
    .eq("is_active", true)
    // Kein Foto = kein Sortiment (Migration 020) – automatisch, kein Schalter.
    .eq("has_image", true);

  query =
    options?.orderBy === "created_at"
      ? query.order("created_at", { ascending: false })
      : query.order("name");

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options?.flag === "is_new") {
    query = query.or(neuheitenFilter(neuAb()));
  } else if (options?.flag) {
    query = query.eq(options.flag, true);
  }

  const term = options?.search ? sanitizeSearch(options.search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[katalog] Artikel:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as (Product & {
    variants: ProductVariant[];
    images: ProductImage[];
  })[];

  // Alle Titelbilder in einem Rutsch signieren statt pro Artikel einzeln.
  const coverPaths = rows.map((row) => firstImagePath(row.images));
  const urls = await getImageUrls(coverPaths);

  return rows.map((row, index) => ({
    ...row,
    variants: row.variants ?? [],
    imageUrl: urls[index],
  }));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(`${LIST_COLUMNS}, category:categories (*)`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[katalog] Artikeldetail:", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Product & {
    variants: ProductVariant[];
    images: ProductImage[];
    category: Category | null;
  };

  const images = sortImages(row.images ?? []);
  const imageUrls = await getImageUrls(images.map((image) => image.file_path));

  return {
    ...row,
    variants: row.variants ?? [],
    images,
    category: row.category ?? null,
    imageUrls,
  };
}

/** Schaufenster-Detail: dieselben Felder wie die Liste, plus alle Fotos. */
export interface PublicProductDetail extends PublicProductListItem {
  category: Category | null;
  imageUrls: (string | null)[];
}

/**
 * Katalog für nicht angemeldete Besucher. Liest aus `products_public`
 * (keine Bestandsspalten) statt aus `products` – Preise werden gar nicht
 * erst abgefragt, RLS würde sie ohnehin nicht herausgeben.
 */
export async function getPublicProducts(options?: {
  categoryId?: string;
  search?: string;
  flag?: ProductFlag;
  /** "created_at" liefert die zuletzt aufgenommenen zuerst; sonst nach Name */
  orderBy?: "created_at";
}): Promise<PublicProductListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("products_public")
    .select(
      "id, category_id, group_id, sku, name, description, is_new, is_topseller, created_at, list_price",
    );

  query =
    options?.orderBy === "created_at"
      ? query.order("created_at", { ascending: false })
      : query.order("name");

  if (options?.categoryId) {
    query = query.eq("category_id", options.categoryId);
  }

  if (options?.flag === "is_new") {
    query = query.or(neuheitenFilter(neuAb()));
  } else if (options?.flag) {
    query = query.eq(options.flag, true);
  }

  const term = options?.search ? sanitizeSearch(options.search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  }

  const { data: products, error } = await query;
  if (error) {
    console.error("[katalog] Öffentliche Artikel:", error.message);
    return [];
  }

  const ids = (products ?? []).map((p) => p.id as string);
  const [coverPaths, preise, gruppen] = await Promise.all([
    firstImagePathsFor(supabase, ids),
    priceRangesFor(supabase, ids),
    groupNamesFor(
      supabase,
      (products ?? []).map((p) => (p.group_id as string | null) ?? null),
    ),
  ]);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));

  return (products ?? []).map((row, index) => {
    const preis = preise.get(row.id as string);
    const groupId = (row.group_id as string | null) ?? null;
    return {
      id: row.id as string,
      category_id: row.category_id as string,
      group_id: groupId,
      groupName: groupId ? (gruppen.get(groupId) ?? null) : null,
      sku: row.sku as string,
      name: row.name as string,
      description: row.description as string | null,
      is_new: row.is_new as boolean,
      is_topseller: row.is_topseller as boolean,
      created_at: row.created_at as string,
      imageUrl: urls[index],
      priceFrom: preis?.min_unit_price ?? null,
      minOrderQuantity: preis?.min_order_quantity ?? null,
      list_price: (row.list_price as number | null) ?? null,
    };
  });
}

/** Warengruppe mit der Zahl der darin gelisteten Artikel. */
export interface LandingCategory extends Category {
  productCount: number;
  /** Signierte URL des Kachelbilds (Migration 031), null = keins hinterlegt */
  imageUrl: string | null;
}

export interface LandingData {
  neuheiten: PublicProductListItem[];
  topseller: PublicProductListItem[];
  categories: LandingCategory[];
  /** Gesamtzahl gelisteter Artikel – Kennzahl in der Über-uns-Sektion */
  productCount: number;
  /** Zuletzt aufgenommene Artikel für das Katalogband im Kopfbereich */
  ticker: PublicProductListItem[];
  /**
   * Querschnitt fürs Sortiment-Schaufenster direkt unter dem Kopfbereich:
   * pro Warengruppe die zuletzt aufgenommenen Artikel, damit die Auswahl
   * nicht aus einer einzigen Gruppe besteht.
   */
  sortiment: PublicProductListItem[];
  /**
   * Vier Bilder im Kopfbereich: reduzierte Artikel, Topseller und Neuheiten,
   * bei jedem Aufruf neu gemischt. Der Kopf ist das Schaufenster – dort
   * gehört hin, was gerade beworben werden soll, und nicht bei jedem Besuch
   * dieselbe Auslage.
   */
  schaufenster: PublicProductListItem[];
}

/**
 * Zufällige Reihenfolge (Fisher-Yates).
 *
 * `sort(() => Math.random() - 0.5)` sieht kürzer aus, mischt aber nachweislich
 * schlecht: die Vergleichsfunktion ist nicht konsistent, und je nach
 * Sortierverfahren bleiben die ersten Einträge auffällig oft vorn.
 */
function mische<T>(liste: T[]): T[] {
  const kopie = [...liste];
  for (let i = kopie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

/**
 * Alles, was die Landingpage an Katalogdaten braucht, in einem Rutsch.
 *
 * Bewusst eine Funktion statt drei: jede Abfrage müsste sonst eigene
 * Bild-URLs signieren lassen, und der Bildabruf ist der teure Teil. So wird
 * pro Artikel genau eine URL signiert, egal in wie vielen Sektionen er steht.
 */
export async function getLandingData(perSection = 8): Promise<LandingData> {
  // Ohne Sitzung: die Startseite ist öffentlich und darf nicht davon abhängen,
  // ob das Token des angemeldeten Besuchers gerade angenommen wird.
  const supabase = createPublicClient();

  const leer: LandingData = {
    neuheiten: [],
    topseller: [],
    categories: [],
    productCount: 0,
    ticker: [],
    sortiment: [],
    schaufenster: [],
  };

  const [{ data: alleZeilen, error }, categories] = await Promise.all([
    supabase
      .from("products_public")
      .select(
        "id, category_id, group_id, sku, name, description, is_new, is_topseller, created_at, list_price",
      )
      .order("created_at", { ascending: false }),
    getCategories(supabase),
  ]);

  if (error) {
    console.error("[katalog] Landingpage:", error.message);
    return leer;
  }
  if (!alleZeilen?.length) return { ...leer, categories: categories.map(ohneArtikel) };

  /*
   * Ausführungen zusammenfalten, bevor irgendeine Sektion daraus schöpft:
   * sonst stünden im Schaufenster vier Bilder derselben Lampe und im Laufband
   * viermal derselbe Name. Behalten wird die zuletzt aufgenommene – die
   * Abfrage sortiert danach (siehe gruppiere() in lib/product-groups.ts).
   */
  const rows = gruppiere(alleZeilen as unknown as PublicRow[]);

  // Bilder und Preise nur für die Artikel holen, die tatsächlich auf der Seite
  // landen – hervorgehobene plus die des Laufbands. Der restliche Katalog
  // zählt nur für die Kennzahlen.
  // "Neu" ist nicht nur das Flag, sondern auch das Aufnahmedatum – siehe
  // lib/product-flags.ts. Deshalb hier über istNeu() filtern, nicht über
  // row.is_new.
  const hervorgehoben = rows
    .filter((row) => istNeu(row) || row.is_topseller)
    .slice(0, perSection * 2);
  const bandZeilen = rows.slice(0, 10);

  /*
   * Schaufenster für den Kopfbereich.
   *
   * Vorrang haben die beworbenen Artikel: reduziert, Topseller, neu. Ein
   * gepflegter Vorher-Preis ist dabei nur der Verdacht auf eine Reduzierung –
   * ob eine übrig bleibt, entscheidet reduzierung() weiter unten mit den
   * Staffelpreisen.
   *
   * Aufgefüllt wird aus dem **gemischten** restlichen Katalog, und das ist
   * der Punkt: solange kaum etwas als Topseller oder Neuheit markiert ist,
   * gäbe eine feste Auffüllung bei jedem Aufruf dieselben vier Bilder. Der
   * Kopf soll sich aber ändern – auch dann.
   *
   * Beide Teile werden vor dem Abschneiden gemischt, damit über die Zeit das
   * ganze Feld drankommt. Die Obergrenze begrenzt, wie viele Bild-URLs
   * signiert werden müssen – der teure Teil der Abfrage.
   */
  const beworben = (row: (typeof rows)[number]) =>
    istNeu(row) || row.is_topseller || row.list_price !== null;

  const schaufensterZeilen = [
    ...mische(rows.filter(beworben)),
    ...mische(rows.filter((row) => !beworben(row))),
  ].slice(0, 16);

  // Querschnitt: reihum eine Warengruppe nach der anderen, damit das
  // Schaufenster die Breite des Sortiments zeigt und nicht nur die Gruppe,
  // in der zuletzt eingepflegt wurde.
  const nachGruppe = new Map<string, typeof rows>();
  for (const row of rows) {
    const gruppe = row.category_id;
    const liste = nachGruppe.get(gruppe) ?? [];
    liste.push(row);
    nachGruppe.set(gruppe, liste);
  }
  const sortimentZeilen: typeof rows = [];
  for (let runde = 0; sortimentZeilen.length < 12; runde += 1) {
    let nachgelegt = false;
    for (const liste of nachGruppe.values()) {
      if (liste.length <= runde) continue;
      sortimentZeilen.push(liste[runde]);
      nachgelegt = true;
      if (sortimentZeilen.length >= 12) break;
    }
    if (!nachgelegt) break;
  }

  const ids = [
    ...new Set(
      [...hervorgehoben, ...bandZeilen, ...sortimentZeilen, ...schaufensterZeilen].map(
        (row) => row.id as string,
      ),
    ),
  ];
  const [coverPaths, preise, gruppenNamen] = await Promise.all([
    firstImagePathsFor(supabase, ids),
    priceRangesFor(supabase, ids),
    groupNamesFor(
      supabase,
      rows.map((row) => (row.group_id as string | null) ?? null),
    ),
  ]);
  const urls = await getImageUrls(ids.map((id) => coverPaths.get(id) ?? null));
  const bilder = new Map(ids.map((id, index) => [id, urls[index]]));

  const zuArtikel = (row: (typeof rows)[number]): PublicProductListItem => {
    const id = row.id as string;
    const preis = preise.get(id);
    const groupId = (row.group_id as string | null) ?? null;
    return {
      id,
      category_id: row.category_id as string,
      group_id: groupId,
      groupName: groupId ? (gruppenNamen.get(groupId) ?? null) : null,
      ausfuehrungen: row.ausfuehrungen,
      sku: row.sku as string,
      name: row.name as string,
      description: row.description as string | null,
      is_new: row.is_new as boolean,
      is_topseller: row.is_topseller as boolean,
      created_at: row.created_at as string,
      imageUrl: bilder.get(id) ?? null,
      priceFrom: preis?.min_unit_price ?? null,
      minOrderQuantity: preis?.min_order_quantity ?? null,
      list_price: (row.list_price as number | null) ?? null,
    };
  };

  const items = hervorgehoben.map(zuArtikel);

  /*
   * Ohne Foto taugt ein Artikel nicht fürs Schaufenster. Danach in zwei Töpfe:
   * vorn, was beworben wird, dahinter der gemischte Rest. Der Vorrang fällt
   * weg, wenn aus dem Vorher-Preis keine Ersparnis wird – dann ist der Artikel
   * eben Auffüllung.
   */
  const schaufensterArtikel = schaufensterZeilen
    .map(zuArtikel)
    .filter((product) => product.imageUrl !== null);
  const hatVorrang = (product: PublicProductListItem) =>
    istNeu(product) ||
    product.is_topseller ||
    reduzierung(product.list_price, product.priceFrom) !== null;
  const schaufenster = [
    ...schaufensterArtikel.filter(hatVorrang),
    ...schaufensterArtikel.filter((product) => !hatVorrang(product)),
  ];

  const proKategorie = new Map<string, number>();
  for (const row of rows) {
    const id = row.category_id as string;
    proKategorie.set(id, (proKategorie.get(id) ?? 0) + 1);
  }

  // Kachelbilder der Warengruppen in einem Rutsch signieren – wie die
  // Artikelfotos, nur aus einer anderen Spalte.
  const kategorieBilder = await getImageUrls(
    categories.map((category) => category.image_path),
  );

  return {
    neuheiten: items.filter((p) => istNeu(p)).slice(0, perSection),
    topseller: items.filter((p) => p.is_topseller).slice(0, perSection),
    categories: categories.map((category, index) => ({
      ...category,
      productCount: proKategorie.get(category.id) ?? 0,
      imageUrl: kategorieBilder[index] ?? null,
    })),
    productCount: rows.length,
    ticker: bandZeilen.map(zuArtikel),
    sortiment: sortimentZeilen.map(zuArtikel),
    schaufenster,
  };
}

function ohneArtikel(category: Category): LandingCategory {
  return { ...category, productCount: 0, imageUrl: null };
}

export async function getPublicProduct(id: string): Promise<PublicProductDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products_public")
    .select(
      "id, category_id, group_id, sku, name, description, is_new, is_topseller, created_at, list_price, category:categories (*)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[katalog] Öffentliches Artikeldetail:", error.message);
    return null;
  }
  if (!data) return null;

  const { data: imageRows } = await supabase
    .from("product_images")
    .select("id, product_id, file_path, display_order, created_at")
    .eq("product_id", id);

  const images = sortImages((imageRows ?? []) as ProductImage[]);
  const [imageUrls, preise] = await Promise.all([
    getImageUrls(images.map((image) => image.file_path)),
    priceRangesFor(supabase, [id]),
  ]);
  const preis = preise.get(id);

  const row = data as unknown as {
    id: string;
    category_id: string;
    group_id: string | null;
    sku: string;
    name: string;
    description: string | null;
    is_new: boolean;
    is_topseller: boolean;
    created_at: string;
    list_price: number | null;
    category: Category | null;
  };

  const gruppen = await groupNamesFor(supabase, [row.group_id]);

  return {
    id: row.id,
    category_id: row.category_id,
    group_id: row.group_id,
    groupName: row.group_id ? (gruppen.get(row.group_id) ?? null) : null,
    sku: row.sku,
    name: row.name,
    description: row.description,
    is_new: row.is_new,
    is_topseller: row.is_topseller,
    created_at: row.created_at,
    category: row.category ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    priceFrom: preis?.min_unit_price ?? null,
    minOrderQuantity: preis?.min_order_quantity ?? null,
    list_price: row.list_price,
  };
}

/**
 * Gruppennamen zu den vorkommenden group_ids.
 *
 * Eigene Abfrage statt eines eingebetteten Joins: `products_public` ist eine
 * View, und PostgREST leitet Beziehungen dorthin nur über die Spalten der
 * Basistabelle ab. Eine kleine Nachfrage ist verlässlicher als eine
 * Einbettung, die bei der nächsten Schemaänderung stillschweigend die ganze
 * Katalogabfrage scheitern ließe.
 */
async function groupNamesFor(
  supabase: KatalogClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const gefragt = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (gefragt.length === 0) return new Map();

  const { data, error } = await supabase
    .from("product_groups")
    .select("id, name")
    .in("id", gefragt);

  if (error) {
    console.error("[katalog] Gruppennamen:", error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((row) => [row.id as string, row.name as string]),
  );
}

/** Erstes Foto je Artikel-ID, für die Titelbilder im öffentlichen Grid. */
async function firstImagePathsFor(
  supabase: KatalogClient,
  productIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (productIds.length === 0) return result;

  const { data, error } = await supabase
    .from("product_images")
    .select("product_id, file_path, display_order")
    .in("product_id", productIds);

  if (error) {
    console.error("[katalog] Öffentliche Titelbilder:", error.message);
    return result;
  }

  const byProduct = new Map<string, { file_path: string; display_order: number }[]>();
  for (const row of data ?? []) {
    const list = byProduct.get(row.product_id as string) ?? [];
    list.push({
      file_path: row.file_path as string,
      display_order: row.display_order as number,
    });
    byProduct.set(row.product_id as string, list);
  }

  for (const id of productIds) {
    const images = byProduct.get(id);
    if (!images || images.length === 0) {
      result.set(id, null);
      continue;
    }
    images.sort((a, b) => a.display_order - b.display_order);
    result.set(id, images[0].file_path);
  }

  return result;
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.display_order - b.display_order);
}

export function firstImagePath(images: ProductImage[] | null): string | null {
  if (!images || images.length === 0) return null;
  return sortImages(images)[0].file_path;
}

/**
 * Warengruppe des zuletzt angelegten Artikels.
 *
 * Vorher stand überall, wo ein Artikel entsteht, die alphabetisch erste
 * Gruppe voreingestellt – im Laden also immer „Spielwaren", auch wenn seit
 * einer Stunde Haushaltswaren ausgepackt werden. Wer eine Lieferung annimmt,
 * bleibt fast immer in derselben Gruppe; die zuletzt benutzte ist deshalb die
 * bessere Vorgabe als jede feste.
 *
 * Abgeleitet aus dem Artikelbestand statt aus einer gemerkten Einstellung: so
 * gilt sie an jedem Gerät und nach jedem Neustart, und es gibt kein zweites
 * Feld, das mit der Wirklichkeit auseinanderlaufen kann.
 *
 * null nur, wenn es noch gar keine Artikel gibt – dann fällt der Aufrufer auf
 * die erste Warengruppe zurück.
 */
export async function getLastUsedCategoryId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("category_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[katalog] Zuletzt benutzte Warengruppe:", error.message);
    return null;
  }
  return (data?.category_id as string | undefined) ?? null;
}

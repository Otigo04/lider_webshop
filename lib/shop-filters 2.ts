/**
 * Filter und Sortierung des Sortiments.
 *
 * Alles steht in der URL: ein Ergebnis lässt sich damit verschicken, der
 * Zurück-Knopf funktioniert, und die Formulare kommen ohne JavaScript aus.
 *
 * Gefiltert und sortiert wird im Anschluss an die Abfrage, nicht in SQL. Der
 * Grund ist der Preis: er liegt in den Staffeln beziehungsweise in der View
 * product_price_range, nicht am Artikel. Bei einigen hundert Artikeln ist das
 * unkritisch. Wächst der Katalog in die Zehntausende, gehört die Sortierung in
 * eine Datenbank-View mit Index.
 */

export const SORT_OPTIONS = [
  { value: "name", label: "Name A–Z" },
  { value: "name-ab", label: "Name Z–A" },
  { value: "preis-auf", label: "Preis aufsteigend" },
  { value: "preis-ab", label: "Preis absteigend" },
  { value: "menge-auf", label: "Mindestabnahme aufsteigend" },
  { value: "neu", label: "Zuletzt aufgenommen" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const SORT_VALUES = SORT_OPTIONS.map((option) => option.value) as string[];

export interface ShopFilters {
  search: string;
  sort: SortValue;
  priceMin: number | null;
  priceMax: number | null;
  /** Nur Artikel, deren Mindestabnahme höchstens so groß ist */
  maxMinQuantity: number | null;
  onlyNew: boolean;
  onlyTopseller: boolean;
  /** Nur Artikel mit freiem Bestand – nur für angemeldete Kunden sinnvoll */
  onlyAvailable: boolean;
}

export const EMPTY_FILTERS: ShopFilters = {
  search: "",
  sort: "name",
  priceMin: null,
  priceMax: null,
  maxMinQuantity: null,
  onlyNew: false,
  onlyTopseller: false,
  onlyAvailable: false,
};

type RawParams = Record<string, string | string[] | undefined>;

function einzelwert(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Zahl aus der URL, negatives und Unsinn fallen auf null zurück. */
function zahl(value: string | string[] | undefined): number | null {
  const roh = einzelwert(value).replace(",", ".").trim();
  if (!roh) return null;
  const wert = Number(roh);
  return Number.isFinite(wert) && wert >= 0 ? wert : null;
}

export function parseShopFilters(params: RawParams): ShopFilters {
  const sort = einzelwert(params.sort);
  const priceMin = zahl(params.preis_min);
  const priceMax = zahl(params.preis_max);

  return {
    search: einzelwert(params.q).slice(0, 100),
    sort: (SORT_VALUES.includes(sort) ? sort : "name") as SortValue,
    // Vertauschte Eingaben nicht als leeres Ergebnis abstrafen.
    priceMin: priceMin !== null && priceMax !== null ? Math.min(priceMin, priceMax) : priceMin,
    priceMax: priceMin !== null && priceMax !== null ? Math.max(priceMin, priceMax) : priceMax,
    maxMinQuantity: zahl(params.menge_max),
    onlyNew: einzelwert(params.neu) === "1",
    onlyTopseller: einzelwert(params.top) === "1",
    onlyAvailable: einzelwert(params.lager) === "1",
  };
}

/** Zugriff auf die Felder, die für Filter und Sortierung nötig sind. */
export interface FilterAdapter<T> {
  name: (item: T) => string;
  /** Günstigster Stückpreis, null wenn keiner sichtbar ist */
  price: (item: T) => number | null;
  minQuantity: (item: T) => number | null;
  isNew: (item: T) => boolean;
  isTopseller: (item: T) => boolean;
  /** Freier Bestand, null wenn er in dieser Ansicht nicht vorliegt */
  stock: (item: T) => number | null;
}

export function applyShopFilters<T>(
  items: T[],
  filters: ShopFilters,
  adapter: FilterAdapter<T>,
): T[] {
  const gefiltert = items.filter((item) => {
    if (filters.onlyNew && !adapter.isNew(item)) return false;
    if (filters.onlyTopseller && !adapter.isTopseller(item)) return false;

    if (filters.onlyAvailable) {
      const bestand = adapter.stock(item);
      if (bestand !== null && bestand <= 0) return false;
    }

    const preis = adapter.price(item);
    // Artikel ohne sichtbaren Preis fliegen nur raus, wenn nach Preis
    // gefiltert wird – sonst verschwänden sie aus der Übersicht.
    if (filters.priceMin !== null && (preis === null || preis < filters.priceMin)) {
      return false;
    }
    if (filters.priceMax !== null && (preis === null || preis > filters.priceMax)) {
      return false;
    }

    if (filters.maxMinQuantity !== null) {
      const menge = adapter.minQuantity(item);
      if (menge !== null && menge > filters.maxMinQuantity) return false;
    }

    return true;
  });

  const sortiert = [...gefiltert];
  const nachName = (a: T, b: T) =>
    adapter.name(a).localeCompare(adapter.name(b), "de");

  switch (filters.sort) {
    case "name-ab":
      sortiert.sort((a, b) => nachName(b, a));
      break;
    case "preis-auf":
    case "preis-ab": {
      const richtung = filters.sort === "preis-auf" ? 1 : -1;
      sortiert.sort((a, b) => {
        const pa = adapter.price(a);
        const pb = adapter.price(b);
        // Artikel ohne Preis stehen immer am Ende, in beide Richtungen.
        if (pa === null && pb === null) return nachName(a, b);
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa === pb ? nachName(a, b) : (pa - pb) * richtung;
      });
      break;
    }
    case "menge-auf":
      sortiert.sort((a, b) => {
        const ma = adapter.minQuantity(a) ?? Number.MAX_SAFE_INTEGER;
        const mb = adapter.minQuantity(b) ?? Number.MAX_SAFE_INTEGER;
        return ma === mb ? nachName(a, b) : ma - mb;
      });
      break;
    case "neu":
      // Die Abfragen liefern bereits nach Aufnahmedatum absteigend, wenn
      // danach sortiert wird – hier bleibt die Reihenfolge deshalb, wie sie ist.
      break;
    default:
      sortiert.sort(nachName);
  }

  return sortiert;
}

/** Anzahl gesetzter Filter – für die Anzeige am Aufklapp-Knopf. */
export function activeFilterCount(filters: ShopFilters): number {
  return [
    filters.priceMin !== null,
    filters.priceMax !== null,
    filters.maxMinQuantity !== null,
    filters.onlyNew,
    filters.onlyTopseller,
    filters.onlyAvailable,
  ].filter(Boolean).length;
}

/**
 * Baut die Adresse mit geänderten Parametern. Leere Werte fallen raus, damit
 * die URL nicht mit `?preis_min=&top=` zugemüllt wird.
 */
export function buildShopHref(
  pfad: string,
  filters: ShopFilters,
  aenderungen: Partial<Record<string, string | null>> = {},
): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== "name") params.set("sort", filters.sort);
  if (filters.priceMin !== null) params.set("preis_min", String(filters.priceMin));
  if (filters.priceMax !== null) params.set("preis_max", String(filters.priceMax));
  if (filters.maxMinQuantity !== null) {
    params.set("menge_max", String(filters.maxMinQuantity));
  }
  if (filters.onlyNew) params.set("neu", "1");
  if (filters.onlyTopseller) params.set("top", "1");
  if (filters.onlyAvailable) params.set("lager", "1");

  for (const [schluessel, wert] of Object.entries(aenderungen)) {
    if (wert === null || wert === "") params.delete(schluessel);
    else params.set(schluessel, wert);
  }

  const abfrage = params.toString();
  return abfrage ? `${pfad}?${abfrage}` : pfad;
}

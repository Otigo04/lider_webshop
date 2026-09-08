import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accentIndex } from "@/lib/accent-colors";
import {
  SORT_OPTIONS,
  activeFilterCount,
  buildShopHref,
  type ShopFilters,
} from "@/lib/shop-filters";
import { cn } from "@/lib/utils";
import type { Category, ProductAttributeGroup } from "@/lib/types";

/** Kategorie samt Trefferzahl in der aktuellen Ansicht. */
export interface FilterCategory extends Category {
  productCount: number;
}

interface ShopFilterPanelProps {
  categories: FilterCategory[];
  /**
   * Gepflegte Merkmale mit ihren Werten (Migration 032). Leer heißt: der
   * Abschnitt entfällt – eine Überschrift ohne Kästchen darunter ist kein
   * Filter, sondern eine Lücke.
   */
  attributes: ProductAttributeGroup[];
  /** Slug der aktiven Kategorie, null auf der Gesamtübersicht */
  activeSlug: string | null;
  filters: ShopFilters;
  /** Ziel des Formulars – bleibt in der aktuellen Ansicht */
  action: string;
  /** Bestandsfilter nur zeigen, wenn Bestände überhaupt sichtbar sind */
  showStockFilter: boolean;
  /** Auf Neuheiten-/Topseller-Seiten wäre der gleichnamige Haken sinnlos */
  showFlagFilters: boolean;
  /**
   * Mengenfilter und -sortierung nur, wenn es Mindestabnahmen über 1 Stück
   * gibt. Sonst stünde dort eine Auswahl, die an jedem Artikel vorbeigeht.
   */
  showMinQuantityFilter: boolean;
  totalCount: number;
}

/**
 * Filterspalte des Sortiments.
 *
 * Ein reines GET-Formular: jeder Filter landet als Parameter in der Adresse,
 * damit sich eine Auswahl verschicken lässt und der Zurück-Knopf tut, was er
 * soll. Kein JavaScript nötig – auf schmalen Bildschirmen klappt ein
 * <details> die Spalte zusammen.
 *
 * Die Kategorien sind Links statt Formularfeldern, weil jede Kategorie eine
 * eigene Adresse hat (/shop/spielwaren). Die gesetzten Filter wandern über
 * buildShopHref mit, sonst wären sie beim Wechsel weg.
 */
export function ShopFilterPanel({
  categories,
  attributes,
  activeSlug,
  filters,
  action,
  showStockFilter,
  showFlagFilters,
  showMinQuantityFilter,
  totalCount,
}: ShopFilterPanelProps) {
  const gesetzt = activeFilterCount(filters);
  // Ein per Adresse gesetzter Mengenfilter bleibt sichtbar, sonst ließe er
  // sich nicht mehr zurücknehmen.
  const zeigeMenge = showMinQuantityFilter || filters.maxMinQuantity !== null;
  /*
   * Warengruppen ohne Artikel führen ins Leere. Die aktive bleibt stehen,
   * auch wenn ein gesetzter Filter sie gerade leer räumt – sonst verschwände
   * die Gruppe, in der man selbst steht.
   */
  const sichtbareGruppen = categories.filter(
    (category) => category.productCount > 0 || category.slug === activeSlug,
  );
  // Merkmale ohne Werte sind unfertig gepflegt und hätten nichts zum Anhaken.
  const merkmale = attributes.filter((attribut) => attribut.values.length > 0);
  const gesetzteWerte = new Set(filters.attributeValues);

  return (
    <aside className="lg:w-64 lg:shrink-0">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-border px-4 py-3 lg:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 font-medium">
            <SlidersHorizontal className="size-4" aria-hidden />
            Filter
            {gesetzt > 0 ? (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-brand-foreground tabular">
                {gesetzt}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-muted-foreground group-open:hidden">
            anzeigen
          </span>
          <span className="hidden text-sm text-muted-foreground group-open:inline">
            ausblenden
          </span>
        </summary>

        <div className="mt-4 space-y-7 lg:mt-0 lg:sticky lg:top-20">
          {/* Warengruppen ------------------------------------------------ */}
          <section>
            <h2 className="eyebrow text-muted-foreground">Warengruppen</h2>
            <ul className="mt-3 space-y-0.5">
              <li>
                <FilterLink
                  href={buildShopHref("/shop", filters)}
                  active={activeSlug === null}
                  count={totalCount}
                >
                  Alle Artikel
                </FilterLink>
              </li>
              {sichtbareGruppen.map((category) => (
                <li key={category.id}>
                  <FilterLink
                    href={buildShopHref(`/shop/${category.slug}`, filters)}
                    active={category.slug === activeSlug}
                    count={category.productCount}
                    dot={accentIndex(category.slug)}
                  >
                    {category.name}
                  </FilterLink>
                </li>
              ))}
            </ul>
          </section>

          <form action={action} className="space-y-7">
            {/* Sortierung ----------------------------------------------- */}
            <section>
              <h2 className="eyebrow text-muted-foreground">Sortierung</h2>
              <div className="mt-3 space-y-1.5">
                {SORT_OPTIONS.filter(
                  (option) =>
                    zeigeMenge || option.value !== "menge-auf",
                ).map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="sort"
                      value={option.value}
                      defaultChecked={filters.sort === option.value}
                      className="size-4 accent-brand"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </section>

            {/* Preis ---------------------------------------------------- */}
            <section>
              <h2 className="eyebrow text-muted-foreground">
                Stückpreis in Euro
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="preis_min" className="text-xs font-normal">
                    von
                  </Label>
                  <Input
                    id="preis_min"
                    name="preis_min"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={filters.priceMin ?? ""}
                    className="tabular"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preis_max" className="text-xs font-normal">
                    bis
                  </Label>
                  <Input
                    id="preis_max"
                    name="preis_max"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={filters.priceMax ?? ""}
                    className="tabular"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Gemeint ist der günstigste Staffelpreis des Artikels.
              </p>
            </section>

            {/* Mindestabnahme ------------------------------------------- */}
            {zeigeMenge ? (
              <section>
                <h2 className="eyebrow text-muted-foreground">
                  Mindestabnahme
                </h2>
                <div className="mt-3 space-y-1.5">
                  {[
                    { value: "", label: "Beliebig" },
                    { value: "12", label: "höchstens 12 Stück" },
                    { value: "50", label: "höchstens 50 Stück" },
                    { value: "200", label: "höchstens 200 Stück" },
                  ].map((option) => (
                    <label
                      key={option.value || "alle"}
                      className="flex cursor-pointer items-center gap-2.5 text-sm"
                    >
                      <input
                        type="radio"
                        name="menge_max"
                        value={option.value}
                        defaultChecked={
                          String(filters.maxMinQuantity ?? "") === option.value
                        }
                        className="size-4 accent-brand"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Merkmale des Artikels ------------------------------------
                Farbe, Größe, Material – gepflegt unter Einstellungen. Innerhalb
                eines Merkmals gilt Oder („rot oder blau"), zwischen zweien Und
                („rot, und zwar in XL"). Ein Farbkreis vor der Bezeichnung: das
                Wort „Bordeaux" sagt weniger als der Ton daneben. */}
            {merkmale.map((attribut) => (
              <section key={attribut.id}>
                <h2 className="eyebrow text-muted-foreground">
                  {attribut.name}
                </h2>
                <div className="mt-3 space-y-1.5">
                  {attribut.values.map((wert) => (
                    <label
                      key={wert.id}
                      className="flex cursor-pointer items-center gap-2.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="merkmal"
                        value={wert.id}
                        defaultChecked={gesetzteWerte.has(wert.id)}
                        className="size-4 accent-brand"
                      />
                      {attribut.kind === "color" ? (
                        <span
                          aria-hidden
                          className="size-4 shrink-0 rounded-full border border-black/20"
                          style={{ backgroundColor: wert.hex ?? "transparent" }}
                        />
                      ) : null}
                      {wert.label}
                    </label>
                  ))}
                </div>
              </section>
            ))}

            {/* Kennzeichen ---------------------------------------------- */}
            {showFlagFilters || showStockFilter ? (
              <section>
                <h2 className="eyebrow text-muted-foreground">Kennzeichen</h2>
                <div className="mt-3 space-y-1.5">
                  {showFlagFilters ? (
                    <>
                      <Kennzeichen
                        name="neu"
                        label="Nur Neuheiten"
                        checked={filters.onlyNew}
                      />
                      <Kennzeichen
                        name="top"
                        label="Nur Topseller"
                        checked={filters.onlyTopseller}
                      />
                    </>
                  ) : null}
                  {showStockFilter ? (
                    <Kennzeichen
                      name="lager"
                      label="Nur verfügbare Artikel"
                      checked={filters.onlyAvailable}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Die Suche steht oben im eigenen Feld – ohne dieses versteckte
                Feld ginge sie beim Anwenden der Filter verloren. */}
            {filters.search ? (
              <input type="hidden" name="q" value={filters.search} />
            ) : null}

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Button type="submit">Filter anwenden</Button>
              {gesetzt > 0 || filters.sort !== "name" ? (
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={buildShopHref(
                      action,
                      // Die Merkmalswerte stehen als eigene Parameter in der
                      // Adresse und lassen sich nicht über `aenderungen`
                      // löschen – dort gilt ein Schlüssel je Eintrag.
                      { ...filters, attributeValues: [] },
                      {
                        sort: null,
                        preis_min: null,
                        preis_max: null,
                        menge_max: null,
                        neu: null,
                        top: null,
                        lager: null,
                      },
                    )}
                  >
                    <X className="size-4" aria-hidden />
                    Filter zurücksetzen
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </details>
    </aside>
  );
}

/** Ein Haken für ein festes Kennzeichen (neu, Topseller, verfügbar). */
function Kennzeichen({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  );
}

function FilterLink({
  href,
  active,
  count,
  dot,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  dot?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            active ? "bg-background/70" : `tag-dot-${dot}`,
          )}
        />
      ) : null}
      <span className="flex-1">{children}</span>
      <span
        className={cn(
          "tabular text-xs",
          active ? "text-background/70" : "text-muted-foreground/70",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

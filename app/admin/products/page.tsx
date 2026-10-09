import type { Metadata } from "next";
import Link from "next/link";
import { Layers, Pencil, Plus, ScanBarcode, Search, Trash2 } from "lucide-react";
import { ArtikelBildZelle } from "@/components/admin/artikel-bild-zelle";
import { ArtikelListeMerker } from "@/components/admin/artikel-liste-merker";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { InlineEdit } from "@/components/admin/inline-edit";
import { ProductFlagsMenu } from "@/components/admin/product-flag-toggle";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteProduct } from "@/lib/actions/admin-products";
import { formatPrice, formatQuantity } from "@/lib/format";
import { freeStock, lowestUnitPrice, reduzierung } from "@/lib/pricing";
import {
  ALLE_AUSFUEHRUNGEN,
  ARTIKEL_SORT,
  ARTIKEL_SORT_LABELS,
  LAGER_FILTER,
  LAGER_FILTER_HILFE,
  LAGER_FILTER_LABELS,
  STANDARD_FILTER,
  abfrageSort,
  baueArtikelQuery,
  filtereArtikel,
  filtereNachLager,
  grundpreis,
  leseArtikelFilter,
  sortiereArtikel,
  zaehleKategorien,
  zaehleLager,
  type ArtikelFilter,
  type LagerFilter,
} from "@/lib/admin-product-filter";
import { ersterBildPfad } from "@/lib/artikel-bilder";
import { getAdminProducts } from "@/lib/queries/admin";
import { getImageUrls } from "@/lib/storage";
import { getGroupOptions } from "@/lib/queries/groups";
import { getCategories } from "@/lib/queries/products";
import { getProductFlags } from "@/lib/queries/product-flags";

export const metadata: Metadata = { title: "Artikel" };

/**
 * Aufnahmedatum, nur bei Sortierung nach Datum eingeblendet. Immer sichtbar
 * wäre es eine Spalte Rauschen: nach dem Anlegen fragt danach niemand mehr –
 * außer eben in dem Moment, in dem man wissen will, was zuletzt hereinkam.
 */
const AUFGENOMMEN = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/**
 * Eine Preiszeile in der Sammelspalte: links das Kürzel (GH = Großhandel,
 * EH = Einzelhandel, „vorher" = Streichpreis), rechts das bearbeitbare Feld.
 */
function PreisZeile({
  kuerzel,
  children,
}: {
  kuerzel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {kuerzel}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Artikelverwaltung.
 *
 * Die Tabelle ist gleichzeitig das Bearbeitungsformular: Bezeichnung, Barcode,
 * Warengruppe, Preis und Bestand lassen sich direkt in der Zelle ändern und
 * gehen sofort in die Datenbank (components/admin/inline-edit.tsx). Für alles
 * Weitere – Staffeln, Fotos, Beschreibung – führt der Name in die Detailseite.
 */
export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  const params = await searchParams;
  const filter = leseArtikelFilter(params);
  const { q: search, ohneBild, inaktiv, lager: lagerFilter, sort } = filter;

  const [alle, categories, customFlags, gruppen] = await Promise.all([
    getAdminProducts({
      search,
      ohneBild,
      inaktiv,
      flagIds: filter.flags,
      sort: abfrageSort(sort),
    }),
    getCategories(),
    getProductFlags(),
    getGroupOptions(),
  ]);

  // Die Zahl an der Warengruppe zählt vor dem Warengruppenfilter, sonst zeigte
  // jede abgewählte Gruppe eine 0. Die Lagerkacheln zählen dagegen nach den
  // übrigen Filtern: „12 ausverkauft" soll in der gewählten Warengruppe die
  // Zahl dieser Warengruppe sein.
  const kategorieZahlen = zaehleKategorien(
    filtereArtikel(alle, { ...filter, kat: [] }),
  );
  const vorLager = filtereArtikel(alle, filter);
  const zaehler = zaehleLager(vorLager);
  const products = sortiereArtikel(filtereNachLager(vorLager, lagerFilter), sort);

  // Nur das erste Foto je Zeile, in einem Rutsch signiert (mit Zwischenspeicher
  // in lib/storage.ts) – kein Aufruf je Zeile.
  const vorschauUrls = await getImageUrls(
    products.map((product) => ersterBildPfad(product.images)),
  );

  const kategorieOptionen = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  /** Adresse für einen geänderten Filterzustand; alles andere bleibt stehen. */
  function hrefMit(aenderung: Partial<ArtikelFilter>): string {
    const query = baueArtikelQuery({ ...filter, ...aenderung });
    return query ? `/admin/products?${query}` : "/admin/products";
  }

  function lagerHref(eintrag: LagerFilter): string {
    return hrefMit({
      lager: lagerFilter.includes(eintrag)
        ? lagerFilter.filter((gesetzt) => gesetzt !== eintrag)
        : [...lagerFilter, eintrag],
    });
  }

  const flagNamen = new Map<string, string>([
    ["is_new", "Neuheit"],
    ["is_topseller", "Topseller"],
    ...customFlags.map((flag) => [flag.id, flag.name] as [string, string]),
  ]);
  const kategorieNamen = new Map(categories.map((c) => [c.id, c.name]));
  const gruppenNamen = new Map(gruppen.map((g) => [g.id, g.name]));

  const bereich = (von: number | null, bis: number | null, einheit: string) =>
    von !== null && bis !== null
      ? `${von}–${bis}${einheit}`
      : von !== null
        ? `ab ${von}${einheit}`
        : `bis ${bis}${einheit}`;

  /** Ein Chip je gesetztem Filter; Klick auf das × nimmt genau diesen heraus. */
  const chips: { label: string; href: string }[] = [
    ...(search ? [{ label: `Suche: ${search}`, href: hrefMit({ q: "" }) }] : []),
    ...(ohneBild ? [{ label: "Ohne Bild", href: hrefMit({ ohneBild: false }) }] : []),
    ...(inaktiv ? [{ label: "Ausgeblendet", href: hrefMit({ inaktiv: false }) }] : []),
    ...filter.flags.map((id) => ({
      label: `Flag: ${flagNamen.get(id) ?? "?"}`,
      href: hrefMit({ flags: filter.flags.filter((f) => f !== id) }),
    })),
    ...filter.kat.map((id) => ({
      label: kategorieNamen.get(id) ?? "Warengruppe",
      href: hrefMit({ kat: filter.kat.filter((k) => k !== id) }),
    })),
    ...filter.gruppe.map((id) => ({
      label:
        id === ALLE_AUSFUEHRUNGEN
          ? "Nur Ausführungen"
          : `Gruppe: ${gruppenNamen.get(id) ?? "?"}`,
      href: hrefMit({ gruppe: filter.gruppe.filter((g) => g !== id) }),
    })),
    ...(filter.preisVon !== null || filter.preisBis !== null
      ? [
          {
            label: `GH-Preis ${bereich(filter.preisVon, filter.preisBis, " €")}`,
            href: hrefMit({ preisVon: null, preisBis: null }),
          },
        ]
      : []),
    ...(filter.bestandVon !== null || filter.bestandBis !== null
      ? [
          {
            label: `Bestand ${bereich(filter.bestandVon, filter.bestandBis, "")}`,
            href: hrefMit({ bestandVon: null, bestandBis: null }),
          },
        ]
      : []),
  ];
  const irgendeinFilter = chips.length > 0 || lagerFilter.length > 0;
  const alleZurueck = hrefMit({ ...STANDARD_FILTER, sort });

  const ohneBarcode = products.filter((product) => !product.barcode).length;
  const FESTE_FLAGS = [
    { value: "is_new", label: "Neuheit" },
    { value: "is_topseller", label: "Topseller" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Artikel</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {products.length === 1 ? "1 Artikel" : `${products.length} Artikel`}
            {irgendeinFilter
              ? ` von ${formatQuantity(alle.length)}`
              : ohneBarcode > 0
                ? ` · ${formatQuantity(ohneBarcode)} ohne Barcode`
                : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/products" className="flex flex-wrap items-center gap-2">
            {/* Die Kachelauswahl steht in der Adresszeile, nicht im Formular –
                ohne diese Felder wäre sie nach jeder Suche weg. */}
            {lagerFilter.map((filter) => (
              <input key={filter} type="hidden" name="lager" value={filter} />
            ))}
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Name oder Artikelnummer"
                aria-label="Artikel suchen"
                className="pl-9"
              />
            </div>

            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="bild"
                value="ohne"
                defaultChecked={ohneBild}
                className="size-4 rounded border-input"
              />
              Ohne Bild
            </label>

            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="status"
                value="inaktiv"
                defaultChecked={inaktiv}
                className="size-4 rounded border-input"
              />
              Ausgeblendet
            </label>

            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Flags{filter.flags.length > 0 ? ` (${filter.flags.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 min-w-48 rounded-md border border-border bg-popover p-2 shadow-md">
                {FESTE_FLAGS.map((flag) => (
                  <label
                    key={flag.value}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="flag"
                      value={flag.value}
                      defaultChecked={filter.flags.includes(flag.value)}
                      className="size-4 rounded border-input"
                    />
                    {flag.label}
                  </label>
                ))}
                {customFlags.length > 0 ? (
                  <>
                    <div className="my-1.5 border-t border-border" />
                    {customFlags.map((flag) => (
                      <label
                        key={flag.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          name="flag"
                          value={flag.id}
                          defaultChecked={filter.flags.includes(flag.id)}
                          className="size-4 rounded border-input"
                        />
                        <span
                          aria-hidden
                          className={`inline-block size-2 rounded-full tag-dot-${flag.color}`}
                        />
                        {flag.name}
                      </label>
                    ))}
                  </>
                ) : null}
              </div>
            </details>

            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Warengruppe{filter.kat.length > 0 ? ` (${filter.kat.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-md">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="kat"
                      value={category.id}
                      defaultChecked={filter.kat.includes(category.id)}
                      className="size-4 rounded border-input"
                    />
                    <span className="flex-1">{category.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {formatQuantity(kategorieZahlen.get(category.id) ?? 0)}
                    </span>
                  </label>
                ))}
              </div>
            </details>

            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Artikelgruppe{filter.gruppe.length > 0 ? ` (${filter.gruppe.length})` : ""}
              </summary>
              <div className="absolute z-10 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-md border border-border bg-popover p-2 shadow-md">
                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    name="gruppe"
                    value={ALLE_AUSFUEHRUNGEN}
                    defaultChecked={filter.gruppe.includes(ALLE_AUSFUEHRUNGEN)}
                    className="size-4 rounded border-input"
                  />
                  Alle Ausführungen
                </label>
                {gruppen.length > 0 ? (
                  <div className="my-1.5 border-t border-border" />
                ) : null}
                {gruppen.map((gruppe) => (
                  <label
                    key={gruppe.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="gruppe"
                      value={gruppe.id}
                      defaultChecked={filter.gruppe.includes(gruppe.id)}
                      className="size-4 rounded border-input"
                    />
                    {gruppe.name}
                  </label>
                ))}
              </div>
            </details>

            {/* Leer heißt unbegrenzt – deshalb schlichte Felder und kein
                NumericInput, der ein leeres Feld als 0 melden würde. */}
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-md border border-input px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                Preis &amp; Bestand
              </summary>
              <div className="absolute z-10 mt-1 w-64 space-y-2 rounded-md border border-border bg-popover p-3 shadow-md">
                {(
                  [
                    ["GH-Preis (€)", "preis", filter.preisVon, filter.preisBis],
                    ["Freier Bestand", "bestand", filter.bestandVon, filter.bestandBis],
                  ] as const
                ).map(([titel, name, von, bis]) => (
                  <div key={name}>
                    <p className="mb-1 text-xs text-muted-foreground">{titel}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        name={`${name}_von`}
                        inputMode="decimal"
                        defaultValue={von ?? ""}
                        placeholder="von"
                        aria-label={`${titel} von`}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        name={`${name}_bis`}
                        inputMode="decimal"
                        defaultValue={bis ?? ""}
                        placeholder="bis"
                        aria-label={`${titel} bis`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>

            {/* Die Sortierung steht im Formular und nicht in der Adresszeile
                daneben: sie wird zusammen mit der Suche gesetzt, und ein
                eigener Knopf dafür wäre ein Klick mehr für dieselbe Frage.
                „Neueste zuerst" ist der Blick nach der Lieferung – was ist
                heute dazugekommen? */}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="sr-only">Sortierung</span>
              <select
                name="sort"
                defaultValue={sort}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {ARTIKEL_SORT.map((wert) => (
                  <option key={wert} value={wert}>
                    {ARTIKEL_SORT_LABELS[wert]}
                  </option>
                ))}
              </select>
            </label>

            <Button type="submit" variant="secondary">
              Filtern
            </Button>
          </form>

          {/* Wareneingang steht neben „Neuer Artikel", weil es für neue Ware
              fast immer der richtige der beiden Wege ist. */}
          <Button asChild variant="outline">
            <Link href="/admin/bestand">
              <ScanBarcode className="size-4" /> Wareneingang
            </Link>
          </Button>

          <Button asChild>
            <Link href="/admin/products/new">
              <Plus className="size-4" /> Neuer Artikel
            </Link>
          </Button>
        </div>
      </div>

      {/* Schnellfilter: die Fragen, die im Laden täglich anfallen, als eine
          Reihe. Die Zahl steht auf der Kachel, damit man sie auch dann sieht,
          wenn man nicht danach filtert – „12 ausverkauft" ist die Information,
          der Klick nur die Folge davon. */}
      <nav aria-label="Schnellfilter" className="mt-5 flex flex-wrap gap-2">
        {LAGER_FILTER.map((filter) => {
          const aktiv = lagerFilter.includes(filter);
          const anzahl = zaehler[filter];

          return (
            <Link
              key={filter}
              href={lagerHref(filter)}
              title={LAGER_FILTER_HILFE[filter]}
              aria-pressed={aktiv}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                aktiv
                  ? "border-brand bg-brand text-brand-foreground"
                  : anzahl > 0
                    ? "border-border bg-card hover:border-brand/40 hover:bg-muted"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {LAGER_FILTER_LABELS[filter]}
              <span
                className={`rounded px-1.5 text-xs tabular ${
                  aktiv ? "bg-white/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {formatQuantity(anzahl)}
              </span>
            </Link>
          );
        })}

      </nav>

      {irgendeinFilter ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          aria-label="Aktive Filter"
        >
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              title="Filter entfernen"
              className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs hover:border-brand/40"
            >
              {chip.label}
              <span aria-hidden>×</span>
              <span className="sr-only">entfernen</span>
            </Link>
          ))}
          <Link
            href={alleZurueck}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Alle zurücksetzen
          </Link>
        </div>
      ) : null}

      <p className="mt-4 rounded-md border border-brand/25 bg-brand-soft px-3 py-2 text-sm text-brand">
        Bezeichnung, Barcode, Warengruppe, alle vier Preise (GH = Großhandel,
        EH = Einzelhandel, vorher = Streichpreis, EK = Einkauf, nur intern)
        und der Bestand lassen sich direkt in der Tabelle ändern – anklicken,
        tippen, Enter.
      </p>

      {products.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {irgendeinFilter
            ? "Keine Treffer für diese Suche/Filter."
            : "Noch keine Artikel angelegt."}
        </p>
      ) : (
        /*
         * Eine Tabellenbreite, keine Seitwärtsbewegung: früher standen zehn
         * Spalten nebeneinander und „Löschen" lag jenseits des Bildrands.
         * Zusammengelegt sind jetzt Artikelnummer unter die Bezeichnung, die
         * drei Preise in eine Spalte und Bestand samt Verfügbarkeit in eine
         * weitere. Die Aktionen sind Symbolknöpfe mit Beschriftung für
         * Screenreader.
         *
         * Trotzdem ein overflow-x-auto wie in den übrigen Adminlisten: sieben
         * Spalten unterschreiten die Fensterbreite eines Handys nicht. Ohne
         * den Rahmen ließ sich die ganze Seite samt Kopfleiste seitlich
         * schieben, statt nur die Tabelle.
         */
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="w-16 py-2 pr-3 font-medium">Bild</th>
                <th className="py-2 pr-3 font-medium">Artikel</th>
                <th className="py-2 pr-3 font-medium">Barcode</th>
                <th className="py-2 pr-3 font-medium">Warengruppe</th>
                <th className="py-2 pr-3 font-medium">Preise</th>
                <th className="py-2 pr-3 font-medium">Bestand</th>
                <th className="py-2 pr-3 font-medium">Flags</th>
                <th className="w-20 py-2 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, index) => {
                const ab = lowestUnitPrice(product.variants ?? []);
                // GH-Zelle zeigt und ändert die Grundstaffel (kleinste
                // Mindestmenge) – dorthin schreibt updateProductField. Mit
                // dem günstigsten Staffelpreis hier stand eine andere Zahl in
                // der Zelle als die, die man beim Tippen überschrieb.
                const grundpreisWert = grundpreis(product);
                const staffelAnzahl = product.variants?.length ?? 0;
                const rabatt = reduzierung(product.list_price, ab, product.retail_price);
                return (
                  <tr
                    key={product.id}
                    id={`artikel-${product.id}`}
                    className="scroll-mt-24 border-b border-border align-top last:border-0 hover:bg-muted/50"
                  >
                    <td className="py-2 pr-3">
                      <ArtikelBildZelle
                        productId={product.id}
                        name={product.name}
                        url={vorschauUrls[index] ?? null}
                        anzahl={product.images?.length ?? 0}
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="name"
                        value={product.name}
                        anzeige={product.name}
                        className="font-medium"
                      />
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 px-2 text-xs text-muted-foreground">
                        <span className="tabular">{product.sku}</span>
                        {sort !== "name" ? (
                          <span className="tabular">
                            · aufgenommen{" "}
                            {AUFGENOMMEN.format(new Date(product.created_at))}
                          </span>
                        ) : null}
                        {!product.is_active ? (
                          <span className="rounded border border-border bg-muted px-1 py-px">
                            ausgeblendet
                          </span>
                        ) : null}
                        {/* Eine Ausführung eines Angebots steht im Shop nicht
                            für sich, sondern hinter einer Auswahl. Wer den
                            Preis hier ändert, soll wissen, dass daneben drei
                            Geschwister stehen. */}
                        {product.group ? (
                          <Link
                            href={`/admin/gruppen/${product.group.id}`}
                            className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand-soft px-1 py-px text-brand hover:underline"
                          >
                            <Layers className="size-3" aria-hidden />
                            {product.group.name}
                          </Link>
                        ) : null}
                      </p>
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="barcode"
                        value={product.barcode ?? ""}
                        anzeige={product.barcode ?? "—"}
                        className={product.barcode ? "code" : "text-muted-foreground"}
                      />
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="category_id"
                        typ="select"
                        optionen={kategorieOptionen}
                        value={product.category_id}
                        anzeige={product.category?.name ?? "—"}
                        className="text-muted-foreground"
                      />
                    </td>

                    {/* Vier Preise übereinander statt in vier Spalten: die
                        Kürzel tragen die Bedeutung, die Zeile bleibt schmal.
                        EK steht unten – er ist der, der am seltensten
                        angefasst wird, und der einzige, der nirgends
                        gedruckt wird. */}
                    <td className="py-2 pr-3">
                      <div className="space-y-0.5">
                        <PreisZeile kuerzel="GH">
                          <InlineEdit
                            id={product.id}
                            field="unit_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={grundpreisWert !== null ? String(grundpreisWert) : "0"}
                            anzeige={
                              grundpreisWert !== null
                                ? `${formatPrice(grundpreisWert)}${staffelAnzahl > 1 ? ` · ${staffelAnzahl} Staffeln` : ""}`
                                : "—"
                            }
                          />
                        </PreisZeile>
                        <PreisZeile kuerzel="EH">
                          <InlineEdit
                            id={product.id}
                            field="retail_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={
                              product.retail_price !== null
                                ? String(product.retail_price)
                                : ""
                            }
                            anzeige={
                              product.retail_price !== null
                                ? formatPrice(product.retail_price)
                                : "—"
                            }
                            className={
                              product.retail_price === null
                                ? "text-muted-foreground"
                                : ""
                            }
                          />
                        </PreisZeile>
                        <PreisZeile kuerzel={rabatt ? `−${rabatt.prozent} %` : "vorher"}>
                          <InlineEdit
                            id={product.id}
                            field="list_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={
                              product.list_price !== null
                                ? String(product.list_price)
                                : ""
                            }
                            anzeige={
                              product.list_price !== null
                                ? formatPrice(product.list_price)
                                : "—"
                            }
                            className={
                              rabatt
                                ? "text-signal line-through"
                                : "text-muted-foreground"
                            }
                          />
                        </PreisZeile>
                        {/* Einkaufspreis, nur fürs Haus: steht auf keinem
                            Beleg und auf keinem Preisschild. */}
                        <PreisZeile kuerzel="EK">
                          <InlineEdit
                            id={product.id}
                            field="cost_price"
                            typ="decimal"
                            ausrichtung="right"
                            value={
                              product.cost_price !== null
                                ? String(product.cost_price)
                                : ""
                            }
                            anzeige={
                              product.cost_price !== null
                                ? formatPrice(product.cost_price)
                                : "—"
                            }
                            className={
                              product.cost_price === null
                                ? "text-muted-foreground"
                                : "text-gold"
                            }
                          />
                        </PreisZeile>
                      </div>
                    </td>

                    <td className="py-2 pr-3">
                      <InlineEdit
                        id={product.id}
                        field="stock_available"
                        typ="number"
                        ausrichtung="right"
                        einheit="Stk."
                        value={String(product.stock_available)}
                        anzeige={formatQuantity(product.stock_available)}
                      />
                      <div className="mt-0.5 px-2">
                        <StockBadge free={freeStock(product)} />
                      </div>
                    </td>

                    <td className="py-2 pr-3">
                      <ProductFlagsMenu
                        productId={product.id}
                        flags={{
                          is_new: product.is_new,
                          is_topseller: product.is_topseller,
                        }}
                        customFlags={customFlags}
                        activeCustomFlagIds={product.flags.map((flag) => flag.id)}
                      />
                    </td>

                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          title="Details bearbeiten"
                        >
                          <Link href={`/admin/products/${product.id}/edit`}>
                            <Pencil className="size-4" aria-hidden />
                            <span className="sr-only">
                              {product.name} bearbeiten
                            </span>
                          </Link>
                        </Button>
                        <ConfirmAction
                          action={deleteProduct}
                          fields={{ id: product.id }}
                          title={`„${product.name}“ löschen?`}
                          description="Artikel, Preisstaffeln und hochgeladene Fotos werden entfernt. Bereits erfasste Bestellungen bleiben unverändert."
                          confirmLabel="Löschen"
                          destructive
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Artikel löschen"
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" aria-hidden />
                              <span className="sr-only">
                                {product.name} löschen
                              </span>
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ArtikelListeMerker />
    </div>
  );
}

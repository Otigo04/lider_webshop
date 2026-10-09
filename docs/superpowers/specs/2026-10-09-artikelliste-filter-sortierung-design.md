# Artikelliste: Warengruppen-Filter, Sortierung, Bereichsfilter

## Ziel

`/admin/products` soll nach Warengruppe sortier- und filterbar sein und
weitere Filter bekommen. Heute gibt es Suche, „Ohne Bild", „Ausgeblendet",
Flags, sechs Schnellfilter (`LAGER_FILTER`) und die Sortierung Name / Neueste /
Älteste. Es fehlen Warengruppe, Preis, Bestand, Artikelgruppe.

„Warengruppe" ist im Admin die Kategorie (`products.category_id`),
„Artikelgruppe" das Angebot mit Ausführungen (`product_groups`).

## Nicht Teil dieser Arbeit

- Einkaufspreis als Filter oder Sortierung (bleibt intern, `product_costs`).
- Lieferant / Marke: kein Feld im Datenmodell.
- Keine Migration, kein Schema-Umbau.

## Ablauf

Alle Filter stehen in der Adresszeile (`searchParams`), kein Client-State.
Zwei Orte, nach dem Muster, das schon gilt:

| Ort | Was | Warum dort |
|-----|-----|-----------|
| `getAdminProducts` (Abfrage) | Warengruppe, „ohne Warengruppe", Artikelgruppe, Sortierung nach Name / Warengruppe / SKU / Datum | Spalten in `products` bzw. Einbettung |
| `lib/admin-product-filter.ts` (Anwendung) | Preis von–bis, Bestand von–bis, Sortierung nach Preis / Bestand | rechnet über Staffeln und `freeStock()`, in PostgREST nicht ausdrückbar |

### Parameter

- `kat` (mehrfach): Kategorie-UUIDs, ODER-verknüpft. Sonderwert `ohne` =
  Artikel ohne Warengruppe.
- `gruppe` (mehrfach): Artikelgruppen-UUIDs, ODER. Sonderwert `ohne` nicht
  nötig; „Nur Ausführungen" = `gruppe=alle`.
- `preis_von`, `preis_bis`: Großhandelspreis der Grundstaffel (kleinste
  Mindestmenge), gleiche Zahl wie in der GH-Zelle der Tabelle.
- `bestand_von`, `bestand_bis`: `freeStock()`.
- `sort`: `name`, `name-z`, `kategorie`, `sku`, `preis-auf`, `preis-ab`,
  `bestand-auf`, `bestand-ab`, `neu`, `alt`. Unbekannter Wert → `name`.
- Bestehend unverändert: `q`, `bild`, `status`, `flag`, `lager`.

Verknüpfung zwischen den Gruppen: UND (wie `filtereNachLager`). Innerhalb von
`kat`, `gruppe`, `flag`: ODER.

### Sortierung nach Warengruppe

Erst Kategoriename (A–Z, Artikel ohne Warengruppe am Ende), dann Name. Die
Abfrage sortiert nach `name`; die Kategorie-Reihenfolge entsteht in der
Anwendung aus dem schon eingebetteten `category.name` (kein zweiter
Datenbankzugriff, die Liste ist ohnehin vollständig geladen). Einheitlicher
Weg für alle Anwendungs-Sortierungen: eine reine Funktion
`sortiereArtikel(products, sort)`.

Ist `sort` ein Datumswert, bleibt die Sortierung in der Abfrage wie bisher.

### Bereichsfelder

Leeres Feld heißt „unbegrenzt", nicht 0. Eingabe über `NumericInput`.
`von > bis` liefert eine leere Liste mit dem normalen Leertext, keine
Fehlermeldung. Artikel ohne Staffelpreis fallen aus jedem Preisbereich
heraus, sobald einer gesetzt ist.

## Oberfläche

1. **Warengruppen-Aufklapper** neben „Flags": Mehrfachauswahl, je Eintrag
   Artikelzahl (gezählt vor dem Kategoriefilter, wie bei den Lagerkacheln),
   Eintrag „Ohne Warengruppe".
2. **Artikelgruppen-Aufklapper**: Mehrfachauswahl plus „Alle Ausführungen".
3. **Bereichsfelder** Preis und Bestand im selben Formular.
4. **Sortierfeld** mit den neuen Werten.
5. **Aktive-Filter-Leiste** unter den Schnellfiltern: ein Chip je gesetztem
   Filter mit Entfernen-Link, dazu „Alle zurücksetzen". Ersetzt die
   Einzel-Schaltfläche „Filter zurücksetzen".
6. Der Leertext „Keine Treffer für diese Suche/Filter." gilt, sobald
   irgendein Filter aktiv ist (heute fehlen `lager` und die neuen).

Der Helfer `href()` in `page.tsx` baut die Adresse heute von Hand aus
einzelnen Variablen. Er wird auf ein gemeinsames Filterobjekt
(`ArtikelFilter` + `baueArtikelQuery()`) umgestellt, damit kein Parameter
beim Umschalten eines anderen verloren geht. Die Funktion liegt in
`lib/admin-product-filter.ts` und ist testbar.

Optik: bestehende Bausteine (Aufklapper wie „Flags", Kacheln, `Input`),
Palette unverändert, keine neue Dekoration.

## Tests (`tests/artikel-filter.test.ts`, Node-Testrunner)

- `sortiereArtikel`: Kategorie dann Name, ohne Kategorie am Ende; Preis auf/ab
  mit Artikeln ohne Preis am Ende; Bestand auf/ab.
- Preis-/Bestandsbereich: offene Grenzen, `von > bis`, Artikel ohne Staffel.
- `baueArtikelQuery`: Rundreise Parsen → Bauen, Mehrfachwerte, Standardwerte
  werden nicht in die Adresse geschrieben.

Danach `npm test`, `npm run lint`, `npm run build`.

## Dokumentation

Abschnitt „Artikelliste: Filter und Sortierung" in `docs/lager.md`;
`docs/todo.md` unberührt.

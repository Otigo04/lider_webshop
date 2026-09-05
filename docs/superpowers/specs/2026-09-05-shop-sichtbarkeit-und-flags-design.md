# Shop-Sichtbarkeit ohne Bild + Admin-Filter + freie Artikel-Flags

Datum: 2026-09-05

## Ausgangslage

Die Ladenkasse (`/admin/pos`) legt bei unbekanntem Barcode sofort einen neuen
Artikel an (`createQuickProduct`, `lib/actions/pos.ts`) – ohne Foto, mit
`is_active: true`. Da `is_active` heute sowohl Shop-Sichtbarkeit als auch
POS-Auffindbarkeit steuert, landen diese Testartikel unmittelbar im
öffentlichen Sortiment (bestätigt: 4 von 16 aktiven Artikeln haben aktuell
kein Bild und erscheinen trotzdem im Shop, u. a. im Katalogband und bei den
Neuheiten).

Ziel: Artikel ohne Bild sind im Webshop nicht sichtbar, aber an der Kasse und
im Inventar ganz normal nutzbar. Dazu passende Filter in der Artikelverwaltung
und ein Weg, eigene Flags zum Organisieren/Filtern anzulegen.

## 1. Automatische Shop-Sichtbarkeit über `has_image`

- Neue Spalte `products.has_image BOOLEAN NOT NULL DEFAULT false`.
- Trigger auf `product_images` (INSERT/DELETE), der `has_image` am
  zugehörigen Produkt nachführt – kein manueller Schalter, immer synchron zum
  tatsächlichen Bildbestand. Backfill für bestehende Artikel mit Fotos.
- `products_public` (View, Migration 006/009/010) bekommt zusätzlich
  `AND has_image` in der WHERE-Klausel. `getPublicProducts`,
  `getLandingData`, `getCategoryCounts` (alle lesen aus der View) übernehmen
  den Filter dadurch ohne Codeänderung.
- RLS-Policy `products_read`: von `is_active OR is_admin()` auf
  `(is_active AND has_image) OR is_admin()` – Sichtbarkeit ist auch auf
  DB-Ebene erzwungen, nicht nur im Query-Code.
- `getProducts` (eingeloggter Shop) bekommt zusätzlich `.eq("has_image", true)`.
  Die Detailseite (`getProduct(id)`) bleibt ungefiltert, weil sie sich die
  Query mit der Admin-Bearbeitungsseite teilt – stattdessen prüft
  `app/shop/product/[id]/page.tsx` `has_image` genau wie schon `is_active`
  und zeigt sonst 404. Ein Artikel ohne Bild ist damit auch über einen
  direkten Link nicht erreichbar/bestellbar.
- Admin-Verwaltung (`getAdminProducts`) ist unverändert: dort geht es ums
  Inventar, nicht um den Shop, `has_image` wird nur als Filter angeboten
  (siehe Abschnitt 2), nie als Zugriffsschranke.
- Kasse (`findProductByCode`, `searchPosProducts`, `createQuickProduct`)
  bleibt unverändert – kein Bezug zu `has_image`, Artikel ohne Bild sind dort
  normal scannbar und verkäuflich.

## 2. Filter in der Artikelverwaltung (`/admin/products`)

Neue Filterleiste neben der bestehenden Suche, alles über URL-Searchparams
(wie `q` heute schon):

- **Toggle „Ohne Bild"** (`?bild=ohne`) – Artikel mit `has_image = false`.
  Das ist zugleich „nicht aktiv im Webshop", weil beides durch Abschnitt 1
  automatisch identisch ist.
- **Toggle „Ausgeblendet"** (`?status=inaktiv`) – Artikel mit
  `is_active = false` (bisher nur als Badge sichtbar, jetzt auch filterbar).
- **Flags-Dropdown** (`?flag=is_new|is_topseller|<custom-flag-id>`,
  mehrfach wählbar, ODER-verknüpft) – listet die festen Flags `is_new` /
  `is_topseller` und alle in den Einstellungen angelegten Custom-Flags
  (Abschnitt 3) in einem Menü.

`getAdminProducts(search)` wird zu `getAdminProducts(options)` mit
`{ search?, ohneBild?, inaktiv?, flagIds? }`.

## 3. Frei definierbare Artikel-Flags

Rein intern (Verwaltung), keine Kundensichtbarkeit, kein Bezug zu
`products_public`.

- Tabelle `product_flags` (id, name, color, created_at).
- Tabelle `product_flag_links` (product_id, flag_id, PK aus beiden Spalten).
- RLS: nur Admins lesen/schreiben.
- `/admin/settings`: neue Sektion „Artikel-Flags" unterhalb der Firmendaten –
  Liste bestehender Flags (Name, Farbpunkt, Löschen-Button), Formular zum
  Anlegen (Name + Farbe aus der bestehenden `tag-1..6`-Akzentpalette). Kein
  Umbenennen-Dialog – dafür reicht Löschen + Neuanlegen.
- `ProductFlagsMenu` (bestehendes Dropdown mit Checkboxen für
  `is_new`/`is_topseller`) bekommt einen zweiten Abschnitt für Custom-Flags,
  gleiches Interaktionsmuster, eigene Server-Action `toggleProductFlagLink`
  (andere Tabelle als die festen Booleans).

## Nicht Teil dieses Vorhabens

- Kein manueller Shop-Sichtbarkeits-Schalter (bewusst automatisch über
  `has_image`, siehe Nutzerentscheidung).
- Custom-Flags werden nicht im Webshop angezeigt oder dort filterbar.
- `is_new` / `is_topseller` bleiben eigenständige, feste Spalten (sie haben
  Sonderverhalten – Neu-Ablauf nach drei Tagen, eigene Shop-Routen – das über
  ein generisches Flag-System abzubilden wäre ein eigenes Vorhaben).

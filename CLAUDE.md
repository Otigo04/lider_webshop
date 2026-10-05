# CLAUDE.md – Großhandels-Shop WebApp

## 🎯 Projektübersicht

**Name:** Lider Großhandel Shop  
**Stack:** Next.js 16 + TypeScript + Tailwind CSS v4 + Supabase + Vercel  
**Ziel:** Professioneller B2B Großhandels-Shop mit Admin-Panel und Customer-Portal

---

## ⚠️ KRITISCHE DESIGN-RICHTLINIE

**Die WebApp darf NICHT nach KI aussehen!**

- ❌ KEINE Glasmorphism, Neumorphism, oder trendy AI-Aesthetics
- ❌ KEINE überdesignten Animationen oder unnötigen Micro-Interactions
- ❌ KEINE generische Placeholder-Texte ("Willkommen", "Lorem Ipsum")
- ✅ Klassisch-professionelle B2B Ästhetik (wie LinkedIn, Shopify für Business)
- ✅ Klare Typografie, Weißraum, konservative Farben
- ✅ Funktionalität > Dekoration
- ✅ Schnelle Ladezeiten, keine unnötigen Effekte

**Design-Palette:**
- Primär: Dunkles Grau/Charcoal (#1F2937, #111827)
- Accent: Dezentes Blau (#2563EB) oder Grün (#059669)
- Neutral: Weiß, Graustufen
- Schrift: System-Fonts (Inter, SF Pro, Segoe UI) – keine Custom-Fonts für Headlines

---

## 👥 User Personas & Workflows

### 1. **Admin Account (Orhan)**
- Vollzugriff auf alle Funktionen
- Kundenverwaltung (erstellen, aktivieren, deaktivieren, bearbeiten)
- Artikel-Management (CRUD, Fotos hochladen, Kategorien, Preisgestaltung)
- Dashboard mit Statistiken (Bestellungen, Lagerbestand, Top-Artikel)
- Reports exportieren

### 2. **Customer Account**
- Login mit Email + Password
- Shop browsing (mit Filter nach Kategorie, Verfügbarkeit)
- Artikel-Details (Beschreibung, Fotos, Preisgestaffeln, Verfügbarkeit)
- In Warenkorb legen, Bestellung aufgeben
- Bestellhistorie einsehen
- (Optional Phase 2: Zahlung / Lieferschein)

### 3. **Anonyme Besucher (Landingpage)**
- Wer wir sind (About-Section)
- Was wir anbieten (Überblick)
- CTA zu Login / Registrierung

---

## 🛠️ Tech Stack Details

| Layer | Tech | Warum |
|-------|------|-------|
| **Frontend** | Next.js 16 (App Router, Turbopack) | Server Components, SSR, Performance |
| **Styling** | Tailwind CSS v4 + shadcn/ui | Professionell, schnell, keine KI-Vibes |
| **Database** | Supabase (PostgreSQL) | Real-time, Auth, Storage für Bilder |
| **Auth** | Supabase Auth via `@supabase/ssr` | Einfach, sicher, keine externe OAuth nötig |
| **File Storage** | Supabase Storage, Buckets `products` und `invoices` (**privat**) | Fotos und Belege nur über Signed URLs, `lib/storage.ts` |
| **Hosting** | Vercel | Native Next.js Support, Auto-Deploy |
| **API** | Next.js Route Handlers + Server Actions | TypeScript, Type-Safe |

### Stack-Besonderheiten (Next 16 / Tailwind v4)

- **`proxy.ts` statt `middleware.ts`** – in Next 16 umbenannt. Enthält den
  Supabase-Session-Refresh und den Login-Zwang für geschützte Routen.
- **Async Request APIs** – `cookies()`, `params` und `searchParams` sind
  Promises und müssen awaited werden.
- **Keine `tailwind.config.ts`** – die Farbpalette steht als CSS-Variablen im
  `@theme`-Block von `app/globals.css`.
- **Typecheck über `npm run build`**, nicht über nacktes `tsc --noEmit`:
  Next generiert Typen wie `LayoutProps` erst beim Build.
- **`@supabase/auth-helpers-nextjs` wird nicht verwendet** (deprecated).

---

## 📊 Database Schema (vereinfacht)

> **Verbindlich ist `supabase/schema.sql`**, nicht dieser Überblick.
> Dort umgesetzte Abweichungen: `order_items` speichert Name/SKU als Snapshot
> und referenziert die Variante nullable (`ON DELETE SET NULL`), damit sich
> bestellte Produkte noch löschen lassen; `orders` hat zusätzlich
> `delivery_address`; `products` hat `is_active`; der Katalog ist per RLS
> **nicht öffentlich**, sondern nur für angemeldete aktive Kunden lesbar.

```sql
-- Users (Admin + Customers)
CREATE TABLE users (
  id UUID PRIMARY KEY (from auth.users),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  company_name TEXT,
  role ENUM ('admin', 'customer') DEFAULT 'customer',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  metadata JSONB
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  order_index INT,
  created_at TIMESTAMP
);

-- Products (Artikel)
CREATE TABLE products (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES categories(id),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  images JSON (array of URLs),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Product Pricing & Stock (Preisgestaffeln + Verfügbarkeit)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  sku_variant TEXT,
  min_quantity INT (z.B. 10),
  max_quantity INT,
  unit_price DECIMAL(10,2),
  stock_available INT,
  stock_reserved INT,
  created_at TIMESTAMP
);

-- Orders (Bestellungen)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES users(id),
  order_number TEXT UNIQUE,
  status ENUM ('draft', 'submitted', 'confirmed', 'shipped', 'delivered'),
  total_amount DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Order Items (Bestellpositionen)
CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2),
  subtotal DECIMAL(12,2),
  created_at TIMESTAMP
);

-- Product Images (Supabase Storage Metadata)
CREATE TABLE product_images (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT (path in Supabase Storage),
  display_order INT,
  created_at TIMESTAMP
);
```

---

## 🎨 Page/Component Struktur

### **Public Pages:**
- `/` – Landingpage (Hero, About, CTA)
- `/login` – Login-Form
- `/faq` – Häufige Fragen, `/kontakt` – Kontaktdaten aus `company_settings`
- `/merkliste` – gemerkte Artikel (auch ohne Konto)

### **Customer Pages (Protected):**
- `/shop` – Shop-Übersicht (Kategorien, Filter, Grid)
- `/shop/[category]` – Kategorie-Detailseite
- `/product/[id]` – Produkt-Detailseite (Fotos, Preisgestaffeln, Stock)
- `/cart` – Warenkorb
- `/checkout` – Bestellformular
- `/orders` – Bestellhistorie
- `/account` – Account-Settings

### **Admin Pages (Protected, nur für Admins):**
- `/admin` – Admin Dashboard (Stats, Übersicht, Tagesumsatz der Kasse)
- `/admin/customers` – Kundenverwaltung
- `/admin/products` – Produktverwaltung
- `/admin/gruppen` – Angebote mit Ausführungen (Farbe, Größe, Wattzahl)
- `/admin/bestand` – Wareneingang (Schnellerfassung) und sein Journal
- `/admin/preisschilder` – Preisschilder fürs Regal, druckfertig auf A4
- `/admin/preisschilder/frei` – Preisschilder von Hand, mit Artikelabgleich
- `/admin/kataloge` – Kataloge zusammenstellen und als A4 drucken / PDF
- `/admin/products/new` – Produkt erstellen
- `/admin/products/[id]/edit` – Produkt bearbeiten
- `/admin/orders` – Bestellverwaltung
- `/admin/categories` – Kategorien verwalten
- `/admin/settings` – Firmendaten, Kassenvorgaben, Merkmale und Artikel-Flags

### **Kassenportal (Protected, nur für Admins):**

Eigener Bereich neben `/admin`, nicht darin – am Tresen wird kassiert und
abgerechnet, in der Verwaltung werden Stammdaten gepflegt. Eigenes Layout
(`app/kasse/layout.tsx`) mit dunkler Reiterleiste; in der Kopfleiste der Seite
steht „Kasse" als goldener Knopf.

- `/kasse` – Buchhaltungsübersicht (Tag, Monat, Zahlarten, offene Forderungen)
- `/kasse/terminal` – Ladenkasse (Barcodescanner, Bon, Beleg)
- `/kasse/verkaeufe` – Verkaufshistorie der Kasse
- `/kasse/umsaetze` – Umsätze nach Zeitraum, je Tag oder je Monat
- `/kasse/tagesabschluss` – Z-Abschlüsse, ein Monat je Seite
- `/kasse/rechnungen` – Rechnungen (auch freie Rechnungen ohne Bestellbezug)

### **Shared Components:**
- `Header` (Navbar mit Logo, Nav-Links, User-Menu)
- `Footer`
- `AuthGuard` (Redirect auf Login wenn nicht authentifiziert)
- `AdminGuard` (Redirect wenn nicht Admin)
- `ProductCard` (in Shop)
- `ProductGrid` (mehrere Cards)
- `PriceTable` (Preisgestaffeln anzeigen)
- `StockBadge` (Verfügbarkeit-Indicator)
- `ImageUpload` (Admin)
- `FormFields` (wiederverwendbar)

---

## 🔐 Authentication & Authorization

**Flow:**
1. Besucher kommt auf Landingpage
2. "Login" klicken → `/login`
3. Supabase Auth mit Email/Password
4. Session in Cookie/localStorage
5. Redirect zu `/shop` (customer) oder `/admin` (admin)
6. Middleware checked `role` aus JWT Claims

**Supabase Auth Setup:**
- Email/Password nur (kein OAuth nötig für B2B)
- Admin erstellt Kunden → Temporary Password via Email
- Kunde setzt beim ersten Login sein Passwort neu

---

## 📦 Preisgestaffeln & Verfügbarkeit

**Beispiel:**
```
Artikel: "Kunststoff-Widget"
├─ Min-Menge: 10
├─ Variante 1: 10-49 Stück → 1,50€/Stück
├─ Variante 2: 50-199 Stück → 1,30€/Stück
├─ Variante 3: 200+ Stück → 1,10€/Stück
└─ Verfügbar: 500 Stück
```

**Darstellung im Shop:**
- Große, gut lesbare Tabelle
- "Ab 10 Stück: 1,50€"
- "Ab 50 Stück: 1,30€"
- Grüner Badge: "500 verfügbar"
- Wenn < 10 verfügbar: Rotes Badge "Begrenzte Verfügbarkeit"

---

## 👨‍💼 Admin-Funktionen Detail

### **Artikel erstellen/bearbeiten:**
1. SKU eingeben (eindeutig)
2. Name, Beschreibung
3. Kategorie auswählen
4. Fotos hochladen (mehrere, Drag-n-Drop)
5. Preisgestaffeln hinzufügen:
   - Min-Menge eingeben
   - Preis pro Stück
   - (Optional) Max-Menge
6. Verfügbar-Menge eingeben
7. Speichern

### **Kundenverwaltung:**
1. Neue Kunde: Email, Name, Firma
2. Temporary Password generieren → Email
3. Kunde-Liste (Name, Email, Firma, Status, Aktionen)
4. Kunde deaktivieren (Login blockiert, aber Bestellhistorie bleibt)
5. Bestellhistorie des Kunden einsehen

### **Dashboard:**
- Total Kunden (aktiv/inaktiv)
- Total Produkte
- Verfügbare Kategorien
- Letzte Bestellungen (Datum, Kunde, Betrag, Status)
- Top 5 Artikel (nach Bestellhäufigkeit)
- Lagerbestände (niedrig/normal/hoch)

---

## 🚀 MVP Features (Phase 1)

✅ Landingpage mit About-Section  
✅ Login/Auth (Admin + Customer)  
✅ Admin Dashboard  
✅ Admin: Artikel-CRUD (inkl. Foto-Upload)  
✅ Admin: Kategorien-CRUD  
✅ Admin: Kundenverwaltung (erstellen, deaktivieren)  
✅ Customer: Shop mit Kategorien + Suchfilter  
✅ Customer: Produkt-Detailseite (Fotos, Preisgestaffeln, Stock)  
✅ Customer: Warenkorb  
✅ Customer: Bestellformular (Menge, Adresse, Notizen)  
✅ Customer: Bestellhistorie  

---

## 📱 Responsive Design

- **Desktop (1024px+):** 2-3 Spalten Product-Grid, volle Admin-Tabellen
- **Tablet (768px-1023px):** 2 Spalten, mobile-friendly Tabellen
- **Mobile (< 768px):** 1 Spalte, Stack-Layout, Hamburger Menu

---

## ✨ Code Quality & Best Practices

- **TypeScript überall** – Type-Safe von Anfang an
- **Server Components als Default** – nur Client-Side wo nötig
- **Error Handling** – Konsistente Error-Messages, nicht technisch
- **Loading States** – Spinners/Skeletons während Daten laden
- **Validierung** – Frontend + Backend (Zod/Yup)
- **Logging** – einfaches Console-Logging, keine Analytics nötig
- **Secrets** – `.env.local` (API Keys, Supabase URL)
- **Git** – Commits nach Features
- **Keine KI-Vibes** – s. Design-Richtlinie oben

---

## 🎯 Erfolgs-Kriterien

- ✅ Login funktioniert (Admin + Customer)
- ✅ Admin kann Artikel mit Fotos hochladen
- ✅ Customer kann Artikel sehen + filtern
- ✅ Preisgestaffeln berechnen sich automatisch
- ✅ Bestellungen werden gespeichert + sichtbar in Histor
- ✅ Design sieht professionell + nicht nach KI aus
- ✅ Seite lädt schnell (<2s Core Web Vitals)
- ✅ Keine Fehler in Console/Network

---

## 📝 Notizen

- Admin-Account (dein Konto) wird manuell in Supabase erstellt
- Customers können sich unter `/register` selbst registrieren (sofort aktiv,
  keine Freischaltung nötig) oder werden manuell vom Admin angelegt (z. B.
  Telefonbestellungen)
- Bilder werden in Supabase Storage gespeichert (nicht DB)
- Keine Zahlung/Payment in Phase 1 (nur Warenkorb + Bestellung)
- Reports/Export = Phase 2
- Mobile App = Phase 3+


---

## 🏷️ Marke und Logo

Der Betrieb heißt **LIDER**, die Unterzeile lautet **„Groß- und Einzelhandel"**.
Nicht „LIDER Berlin" – der Ort gehört nicht in den Namen. Berlin steht nur
dort, wo es eine Ortsangabe ist (Abholung, Kennzahl „Standort", Fußzeile), nie
im Kopfbereich der Startseite und nie neben dem Namen.


Die Logodateien liegen unter `public/logo/`, der Zugriff läuft über
`lib/logo.ts` – nie direkt über den Pfad:

| Datei | Zweck |
|-------|-------|
| `logo.png` | Lockup (Wappen über Schriftzug) – Impressum, Fußzeile, Anmeldeseiten |
| `logo-mark.png` | nur das Wappen, quadratisch – Kopfleiste und Menü |
| `logo-print.png` | RGB ohne Alpha, klein – Briefkopf im Rechnungs-PDF |
| `logo-original.png` | unbeschnittene Quelldatei, wird nicht ausgeliefert |

`app/icon.png` ist das Favicon (Wappen, 256 px). Die Markenfarben in
`app/globals.css` sind aus dem Logo gezogen: Wappenblau `#284078` (`--brand`),
Lorbeergold `#b8721c` (`--gold`), Schriftrot `#a02020` (`--signal`). Gold ist
die Akzentfarbe auf dunklen Flächen, Rot bleibt Signalfarbe.

---

## 🏪 Ladenkasse (POS)

`/kasse/terminal`, nur für Admins. Grundlage:
`supabase/migrations/018_kasse_pos.sql`.

- **Zwei Preislisten**: Migration 022 legt `products.retail_price` an – den
  Ladenpreis für Privatkundschaft. Die Großhandelsstaffeln in
  `product_variants` bleiben unverändert. Welche Liste gilt, folgt aus dem
  ersten Schritt an der Kasse: Kundenkonto gewählt → Großhandel,
  „Privatkunde" → Einzelhandel (`PosPriceMode`, `counterUnitPrice()` in
  `lib/pricing.ts`). Ohne gepflegten Ladenpreis fällt die Kasse auf die
  kleinste Staffel zurück.

- **Scanner**: USB-Handscanner melden sich als Tastatur an und schließen jeden
  Code mit Enter ab. Der Tastatur-Wächter steht in `lib/use-scan-focus.ts` und
  wird von Kasse *und* Wareneingang benutzt: getippte Zeichen außerhalb eines
  Eingabefelds springen ins Scannerfeld. Pausiert, solange ein Dialog offen
  ist – dort tippt jemand von Hand.
- **Sofort scannen**: Der Kundenschritt (`pos-customer-step.tsx`) hat oben ein
  Scannerfeld mit Autofokus. Ein Scan dort öffnet den Bon als Barverkauf zu
  Ladenpreisen und legt den Artikel gleich auf – der häufigste Vorgang am
  Tresen darf nicht mit zwei Mausklicks beginnen. Ein Händlerkonto bleibt eine
  bewusste Auswahl.
- **Suche**: `products.barcode` zuerst, danach `products.sku` als Notnagel
  (`lib/queries/pos.ts`). Kein Treffer öffnet den Anlegedialog mit dem
  gescannten Code.
- **Buchen**: ausschließlich über `create_pos_sale()` in der Datenbank – dort
  wird der Bestand unter Zeilensperre geprüft und abgebucht und die Summen
  gerechnet. Der Browser rechnet nur für die Anzeige mit.
- **Steuersatz und Preislesart** stehen in `company_settings`
  (`pos_vat_rate`, `pos_prices_gross`) und werden unter `/admin/settings`
  gepflegt – nichts davon ist im Code festverdrahtet.
- **Freie Position**: Zeile ohne Artikelstamm für Dienstleistungen und Ware,
  die nicht im Bestand geführt wird – siehe „Freie Position an der Kasse".
- **Belege**: PDF über `lib/invoice.ts` (`buildPosReceiptPdfData`), abgelegt im
  Bucket `invoices` unter `pos/<sale_id>/<Belegnummer>.pdf`, erreichbar über
  `/kasse/verkaeufe/[id]/receipt`.
- **Nummernkreise**: Bestellungen `LG-JJJJ-00001`, Rechnungen `LDxxxxxxx`
  (Migration 029, davor `LIxxxxxxx`), Kassenbelege `LBxxxxxxx`. Bereits
  vergebene LI-Nummern bleiben stehen – eine gestellte Rechnung behält ihre
  Nummer, sonst bricht die fortlaufende Nummerierung. Der Zähler läuft weiter,
  LI und LD überschneiden sich deshalb nie.

---

## 🧾 Rechnungs- und Belegvorlage

Ein Layout für alles: `generateInvoicePdf()` in `lib/invoice.ts` zeichnet
Katalogrechnung, freie Rechnung und Kassenbeleg. Die drei `build*PdfData()`
bringen ihre Quelle vorher auf dieselbe `InvoicePdfData`-Form.

- **Aufbau**: Briefkopf (Logo rechts, Absender links, Eckdatenkasten),
  Empfängeranschrift im Fensterfeld, Positionstabelle
  *Pos. · Bezeichnung · Menge · Preis · Gesamt*, Summenblock
  (netto → USt. je Satz → Bruttobalken), Zahlungshinweis, Fußzeile.
- **Fußzeile** steht auf **jeder** Seite, vierspaltig: Anschrift (mit Inhaber),
  Kontakt, Bankverbindung, Steuernummer/USt-IdNr. Leere Angaben fallen weg.
- **Zahlungsziel** nur auf Rechnung. Setzt der Aufrufer `paymentNote`
  (Kassenbeleg: „bar erhalten"), entfällt das Fälligkeitsdatum – sonst läse
  sich ein bezahlter Bon wie eine offene Forderung.
- **Abweichende Lieferanschrift** steht in einem eigenen Kasten zwischen
  Belegtitel und Positionstabelle, in 11,5 pt fett mit goldener Kante. Nach
  ihr wird beim Packen gegriffen; in Fußnotengröße wurde sie überlesen, und
  dann ging die Ware an die Rechnungsadresse. Nur, wenn sie wirklich abweicht –
  sonst stünde dieselbe Anschrift zweimal auf dem Blatt.
- **Farbe** kommt aus dem Logo: Wappenblau trägt Tabellenkopf und Endbetrag,
  Gold die Trennlinien. Kein Schmuck ohne Funktion.
- **Umlaute und fremde Schriftzeichen**: `sicher()` entschärft jeden Text vor
  der Ausgabe. Die Standardschriften von pdf-lib sind WinAnsi-kodiert und
  werfen sonst bei „Yılmaz" oder „Şahin" – aus einer Rechnung würde ein 500er.
- **Kontaktdaten** der Fußzeile (`owner_name`, `phone`, `email`, `website`)
  stehen in `company_settings` (Migration 019) und werden unter
  `/admin/settings` gepflegt.

---

## 📄 Lieferschein

`buildDeliveryNotePdfData()` in `lib/invoice.ts`, ausgeliefert über
`/admin/orders/[id]/dokumente`. Dieselbe Vorlage wie die Rechnung, nur mit
`hidePrices` – ein eigenes Layout hieße Briefkopf, Pflichtfußzeile und
Positionstabelle ein zweites Mal pflegen.

- **Keine Beträge.** Der Zettel reist mit der Ware und wird beim Auspacken
  gelesen, womöglich vom Personal des Kunden. Statt des Summenblocks stehen
  unten Positionszahl, Gesamtmenge und zwei Linien zum Quittieren – das sind
  die Zahlen, gegen die abgezählt wird.
- **Empfänger ist, wer die Ware bekommt**, nicht der Zahlungspflichtige: im
  Anschriftenfeld steht die Lieferanschrift, ersatzweise die
  Rechnungsanschrift (`lieferanschriftZeilen(order, { immer: true })`).
- **Nummer ist die Bestellnummer**, kein eigener Nummernkreis. Ein dritter
  Zähler neben Rechnung und Kassenbeleg müsste lückenlos bleiben, ohne dass es
  dafür einen Grund gibt.
- **Route Handler mit `Content-Disposition: inline`**: `?art=beides`
  (Vorgabe) legt Rechnung und Lieferschein in **ein** PDF, `?art=rechnung`
  und `?art=lieferschein` je eines. Am Tresen geht der Druckdialog damit
  einmal auf; zwei Dateien hießen zweimal öffnen und zweimal drucken.
- Die Rechnung kommt, wenn vorhanden, als **gespeicherte Datei** aus dem
  Bucket – Blatt für Blatt dasselbe Dokument, das der Kunde per Mail bekam.
  Fehlt sie, wird sie neu gezeichnet, dann aber mit `invoices.issued_at`:
  ein zweiter Ausdruck mit heutigem Datum wäre ein anderes Dokument unter
  derselben Nummer.

---

## 🆕 Neu-Kennzeichnung

Ein Artikel gilt als neu, wenn das Flag `is_new` gesetzt ist **oder** er jünger
als drei Tage ist (`lib/product-flags.ts`, `NEU_TAGE`). Die Regel gilt an allen
Stellen gleich: Badge auf der Karte, Neuheiten-Sektion der Startseite, Filter
und die Route `/shop/neuheiten`.

---

## ✍️ Inline-Bearbeitung im Adminpanel

`components/admin/inline-edit.tsx` verwandelt eine Tabellenzelle beim Anklicken
in ein Eingabefeld; Enter oder Fokusverlust speichert sofort, Escape verwirft.
Die Zelle kennt ihr Ziel nicht – die Server Action kommt als Prop
(`updateProductField`, `updateCategoryField`). Jedes Feld hat dort ein eigenes
Zod-Schema; ein Feldname ohne Schema wird abgewiesen.

---

## 💰 Einkaufspreis

`supabase/migrations/047_einkaufspreis.sql`. Die dritte Preisangabe neben
Großhandelsstaffel und Ladenpreis – und die einzige, die **nie gedruckt**
wird: nicht aufs Preisschild, nicht auf Bon, Beleg, Z-Bon oder Rechnung.

- **Eigene Tabelle `product_costs`**, keine Spalte an `products`. RLS wirkt
  zeilenweise, und `products_read` (Migration 020) gibt jedem angemeldeten
  aktiven Kunden die *ganze* Zeile frei – deshalb ist auch `retail_price`
  kundenlesbar. Spaltengrants lösen es nicht: Migration 034 schützt damit
  `anon`, aber Admin und Kunde sind beide `authenticated`, und ein GRANT gilt
  der Rolle. `USING (is_admin())` ist der einzige Weg, der dichthält, und
  kostet nur einen Join (`cost:product_costs (cost_price)`).
- **`ON DELETE CASCADE`**, anders als `stock_entries`: der Einkaufspreis ist
  eine Angabe am Artikel und ohne ihn sinnlos. Das Journal ist Geschichte und
  überlebt den Artikel.
- **`stock_entries.cost_price`** hält, was eine *einzelne* Lieferung gekostet
  hat. `product_costs` kennt nur den letzten Wert; ohne das Journal ließe sich
  die Marge einer vergangenen Lieferung nicht nachrechnen. `NULL` heißt wie
  bei den anderen beiden Preisen „diese Buchung hat ihn nicht angefasst".
- **Leeres Feld heißt „unverändert", nicht „0 €"**, überall. Beim Inline-Edit
  und im Artikelformular löscht es die Zeile – 0,00 € Einkauf gibt es nicht,
  und an der Kasse stünde dann „Marge 100 %".
- **Gepflegt** im Wareneingang (dritte Preisspalte „EK"), im
  Kassen-Anlegedialog, im freien Preisschild-Generator (nur für die
  Neuanlage), im Artikelformular (eigener Block) und inline in der Spalte
  „Preise" der Artikelliste.
- **Angezeigt** an der Kasse als Nebenzeile der Bonzeile und in der
  Trefferliste der Namenssuche: `EK 7,40 · Marge 42 %`. Gerechnet in
  `marge()` (`lib/pricing.ts`) auf den Verkaufspreis, nicht auf den Einkauf –
  am Tresen ist die Frage „wie viel von diesem Preis bleibt übrig". Ohne
  gepflegten Wert steht dort nichts, und bei freien Positionen auch nicht.
- **Der verdeckte Code am Regal bleibt der Großhandelspreis** (`ghCode()`).
  Ihn auf den Einkaufspreis umzustellen hieße, dass zwei Schilder im selben
  Regal unter demselben „#" verschiedene Zahlen meinen, ohne dass man es
  ihnen ansieht. Der Kommentar dort nannte den Code früher fälschlich
  „Einkaufspreis".
- **`createQuickProduct()` schreibt eine Journalzeile** für den
  Anfangsbestand (`is_new_product = true`). Vorher entstand über Kasse und
  Preisschild Bestand ohne Herkunft: `stock_available` am Artikel, nichts in
  `stock_entries`. Scheitert sie, bleibt der Artikel verkaufsfähig – eine
  Lücke in der Historie ist weniger schlimm als ein wartender Kunde.
- **Bestand im freien Preisschild-Generator mindestens 1, ohne Fehlermeldung.**
  `legeSchildArtikelAn()` klemmt den Wert auf `Math.max(1, …)`, bevor er an
  `createQuickProduct()` geht; die Vorgabe im Formular steht schon auf „1".
  Ein frisch gescannter Code steht für Ware in der Hand, und das Anlegen soll
  daran nicht hängen bleiben – anders als bei einer echten Fehleingabe wird
  hier stillschweigend nach oben gerundet, nicht abgelehnt. **Nur dieser Weg.**
  `createQuickProduct()` selbst erlaubt weiterhin 0: die Kasse legt auch
  Artikel an, die erst noch geliefert werden (Vorbestellung, noch keine
  Stückzahl im Haus) – ihr Anlegedialog zeigt „1" nur als Vorschlag, kein
  Zwang. Dieselbe Funktion, zwei Aufrufer, zwei Erwartungen: die Grenze
  gehört an den Aufrufer, der sie braucht, nicht an die gemeinsame Funktion.

---

## 🔻 Reduzierte Artikel

`products.list_price` (Migration 023) ist der **Vorher-Preis**, nichts weiter:
eine Behauptung über den früheren Preis, deshalb am Artikel und nicht an einer
Staffel. `reduzierung()` in `lib/pricing.ts` entscheidet, ob daraus eine
Anzeige wird – nur wenn der Wert über dem aktuellen Preis liegt und gerundet
mehr als 0 % Ersparnis übrig bleiben. Ein Cent Unterschied ist kein Angebot.

- **Der Vorher-Preis ist ein Ladenpreis** (Migration 045). Ob und wie stark
  reduziert ist, entscheidet der Vergleich mit `retail_price` – vorher wurde
  gegen den Großhandelspreis gerechnet, und aus 9,99 → 8,99 im Laden wurde im
  Shop „−55 %". **Ohne gepflegten Ladenpreis keine Reduzierung** – ein
  Rückfall auf den Großhandelspreis erfände einen Rabatt. Das Preisschild
  übergibt seinen Schildpreis (Ladenpreis, ersatzweise Staffel) selbst als
  Bezug. `reduzierung(list, angezeigt, laden)` – der dritte Parameter ist
  Pflicht, damit kein Aufrufer ihn vergisst. **Der Generator unter
  `/admin/preisschilder` und `/admin/preisschilder/frei` bekommt `vorher`
  deshalb erst gar nicht gereicht, wenn kein Ladenpreis gepflegt ist** –
  `zuPreisschildArtikel()` in `lib/queries/preisschilder.ts` setzt es auf
  `null`, sobald `preis` auf die Staffel zurückgefallen ist. Ohne diese
  Sperre reichte die Staffel als „Ladenpreis" an `schildPreis()` durch (sie
  ist ja ebenfalls > 0), und die Reduzierung wurde gegen die Staffel
  gerechnet statt gegen einen echten Ladenpreis – je nach Verhältnis beider
  Zahlen mal gar keine Reduzierung (weißes Schild mit dem alten Preis), mal
  eine erfundene (der reduzierte Preis stand als normaler Preis da). Scannt
  jemand einen reduzierten Artikel, kommt das Schild jetzt nur dann rot, wenn
  am Artikel wirklich ein Ladenpreis über dem Streichpreis steht.
- **Im Shop wird der Prozentsatz übertragen**: angezeigt wird der
  Großhandelspreis, der Streichpreis ist derselbe Preis vor der Reduzierung
  (`jetzt × list / laden`). In der Karte `range.from`, auf der Artikelseite
  der Preis der eingestellten Menge – der Streichpreis wandert mit der
  Staffel mit.
- Das Schaufenster bekommt den Ladenpreis über `product_price_range.sale_base`
  – **nur** bei Artikeln mit Streichpreis (der steht ohnehin rot am Regal).
  Alle anderen Ladenpreise bleiben intern.
- **Darstellung** über `components/sale-price.tsx`: neuer Preis in Signalrot,
  alter durchgestrichen, Prozentbadge. Drei Angaben, nicht nur Farbe – rot
  allein wäre für Farbfehlsichtige kein Unterschied.
- Der Streichpreis steht **auch in `products_public`**, anders als der
  Ladenpreis: eine Reduzierung ist Werbung und gehört ins Schaufenster.
- Gepflegt wird er im Artikelformular (eigener Block) und inline in der
  Artikelliste (Spalte „Preise", Zeile „vorher").

---

## 🧻 Kassenbon (Bondrucker)

`/kasse/verkaeufe/[id]/bon` – **Route Handler**, keine Seite: der Bon soll ohne
Kopfleiste und Reiter im eigenen Fenster stehen; als Seite läge er unter dem
Kassenlayout und brächte dessen Rahmen aufs Papier. Erzeugt wird er von
`buildReceiptHtml()` in `lib/pos-receipt.ts`.

- **Kein ESC/POS**, sondern HTML plus `window.print()`. Damit druckt jeder
  Bondrucker, für den ein Treiber installiert ist – ohne feste IP und ohne
  Herstellerdialekt.
- **Schwarzweiß**, Monospace, `@page { size: 80mm auto; margin: 0 }`.
  `?breite=58` für schmale Rollen, `?druck=0` unterdrückt den Druckdialog.
- **Logo als Data-URI** eingebettet: eine nachgeladene Datei käme womöglich
  nach dem Druckdialog, dann fehlt sie auf dem Papier.
- Inhalt: Logo, Firmendaten samt Steuernummern, Belegnummer, Zeitpunkt,
  Positionen, Summe, Steuerausweis, Zahlart, `company_settings.pos_receipt_footer`.
- Erreichbar aus dem Abschlussdialog der Kasse und aus der Verkaufsliste.
  Das A4-PDF unter `/receipt` bleibt daneben bestehen – zwei Medien, zwei
  Layouts.

---

## 📦 Bestandsführung

Wer den Bestand anfasst und wie:

| Vorgang | Wirkung |
|---------|---------|
| Checkout des Kunden (`create_order`) | `stock_reserved` +Menge – Ware ist noch da, aber vergeben |
| Admin legt Bestellung an (`create_admin_order`) | `stock_available` −Menge (Migration 023) – die Bestellung ist sofort `confirmed`, die Ware geht raus |
| Kassenverkauf (`create_pos_sale`) | `stock_available` −Menge, nach unten bei 0 begrenzt (Migration 048) |
| Wareneingang (`record_stock_entries`) | `stock_available` ±Menge, Journalzeile in `stock_entries` |

Freie Rechnungen (`create_manual_invoice`) rühren den Bestand **nicht** an:
ihre Positionen sind Freitext ohne Artikelbezug. Wer Ware abbuchen will, legt
die Rechnung über „Aus Katalog" an.

**Kein Bestand ist kein Verkaufsverbot.** Bis Migration 048 lehnte
`create_pos_sale()` eine Zeile ab, sobald die Menge den freien Bestand
überstieg – am Tresen die falsche Reihenfolge: der Kunde hat die Ware in der
Hand, dass sie im System noch fehlt (Inventurdifferenz, Wareneingang noch
nicht gebucht), ist nicht sein Problem. Scan und Namenssuche nehmen den
Artikel jetzt immer auf, Mengenänderung in der Bonzeile ebenso; es steht nur
eine Warnung in der Statusleiste ("kein Bestand – wird trotzdem gebucht").
Gebucht wird so, als wäre der Bestand da. `stock_available` selbst fällt
dabei nicht unter 0 (`GREATEST(..., 0)`) – das ist eine Vorratszahl, keine
Schuld –, die tatsächlich verkaufte Menge steht wie immer vollständig in
`pos_sale_items`. Dieselbe Regel gilt für `PosProductSearch`
(`components/pos/pos-product-search.tsx`): ein ausverkaufter Treffer ist
weiterhin rot markiert ("ausverkauft"), aber anklickbar – vorher sperrte
`disabled` die Zeile auch im Wareneingang, wo man gerade deshalb sucht, weil
ein Artikel ohne Bestand dasteht.

---

## 📅 Tagesabschluss (Z-Kasse)

`/kasse/tagesabschluss`, Grundlage `supabase/migrations/025_tagesabschluss.sql`.

- **`pos_day_closings`** hält je Kassentag eine Zeile mit fortlaufender
  Z-Nummer (`Z00001`), Belegzahl, Netto/USt./Brutto, Bar/Karte und dem
  Belegnummernbereich. Die Z-Nummer wird bei einem zweiten Abschluss desselben
  Tages **nicht** neu vergeben – die Reihe muss lückenlos bleiben.
- **Zwei Zahlen nebeneinander**: `pos_day_totals()` rechnet live aus den Bons,
  die Abschlusszeile hält fest, was beim Abschluss galt. Weichen sie ab, wurde
  danach noch gebucht; die Übersicht zeigt das an und bietet „Neu abschließen"
  – überschrieben wird nichts von selbst.
- **Automatik ohne Cron**: `close_open_pos_days()` schließt beim Öffnen von
  `/kasse` oder `/kasse/tagesabschluss` jeden vergangenen Tag nach, der noch
  offen ist (`holeAbschluesseNach()` in `lib/queries/kasse.ts`). Wer die Kasse
  öffnet, holt damit den vergessenen Vorabend nach. pg_cron wäre ein
  Betriebsteil mehr, der still ausfallen kann.
- **Ladenzeitzone**: Ein Kassentag endet mit dem Ladenschluss, nicht um
  Mitternacht UTC. `pos_zeitzone()`/`pos_kassentag()`/`pos_heute()` ziehen die
  Grenze in `Europe/Berlin`; die Anwendung rechnet keine Tagesgrenzen selbst
  nach.
- **Z-Bon**: `/kasse/tagesabschluss/[datum]/bon`, dasselbe Bonpapier wie der
  Kassenbon (`buildZBonHtml()` in `lib/pos-receipt.ts`, gemeinsames Gerüst
  `bonGeruest()`).
- **Löschen** (Migration 026): `delete_pos_day_closing()` nimmt einen Abschluss
  zurück, `reset_pos_day_closings()` verwirft alle und setzt die Nummerierung
  auf Z00001 – Letzteres nur hinter getippter Bestätigung, gedacht für die
  Einrichtungsphase. Die Z-Nummer eines einzeln gelöschten Abschlusses bleibt
  verbraucht: sie stand womöglich schon auf einem gedruckten Bon, und eine
  zweite Buchung unter derselben Nummer wäre schlimmer als eine Lücke.
  Verkäufe werden nie gelöscht, nur die Festschreibung.
- **`company_settings.pos_closing_from`** ist die Grenze der Automatik. Ohne
  sie legte `close_open_pos_days()` einen gerade gelöschten Tag beim nächsten
  Seitenaufruf sofort wieder an. Löschen schiebt die Grenze hinter den Tag,
  Zurücksetzen auf heute. Von Hand abschließen geht weiterhin für jeden Tag.

---

## 🛒 Bestellablauf des Kunden

Grundlage: `supabase/migrations/029_bestellablauf.sql`.

- **Ein Steuersatz für alles.** `company_settings.pos_vat_rate` gilt für die
  Ladenkasse *und* den Shop – zwei Felder für dieselbe Zahl gingen früher oder
  später auseinander. `create_order()` schreibt ihn als `orders.vat_rate` fest;
  eine alte Bestellung darf sich nach einer Satzänderung nicht rückwirkend
  anders rechnen. Gerechnet wird in `lib/vat.ts`, immer auf die Summe und nie
  auf die einzelne Zeile: sonst weicht die Summe der gerundeten Zeilen von der
  gerundeten Summe ab.
- **Netto und brutto stehen nebeneinander**, in Warenkorb, Kasse, Bestellung
  und Mail. Netto ist die Zahl, die ein Gewerbekunde vergleicht; brutto die,
  die von seinem Konto geht.
- **Lieferadresse strukturiert.** `orders.delivery_*` statt eines Textfelds –
  eine Rechnung braucht Einzelfelder. `delivery_address` bleibt als lesbare
  Zusammenfassung und für Altbestand. Im Checkout wählt der Kunde zwischen der
  hinterlegten Anschrift und einer abweichenden; die abweichende gilt nur für
  diese Bestellung und ändert sein Konto nicht.
- **Zahlart** (`orders.payment_method`): Überweisung immer, bar und Karte
  **nur** bei Selbstabholung. Das erzwingt ein CHECK, nicht nur das Formular –
  eine versendete Bestellung auf "bar" wäre eine Forderung, die niemand je
  einzieht.
- **Nach dem Absenden** landet der Kunde auf `/orders/[id]?neu=1`, nicht in der
  Liste: dort steht der Gesamtbetrag, die Bankverbindung, die Rechnungsnummer
  als Verwendungszweck und das Zahlungsziel. Er will wissen, was zu tun ist,
  und nicht seine eigene Bestellung aus einer Tabelle suchen.
- **Abholung**: Der Kunde kann einen Wunschtermin angeben (`pickup_at`,
  frühestens morgen 08:00 – kommissioniert wird nicht in der Minute der
  Bestellung). Der Admin setzt den Status auf „Abholbereit"; das läuft über
  `mark_order_ready()`, weil Status und Zeitpunkt (`ready_at`) zusammengehören,
  und verschickt automatisch `lib/emails/order-ready.ts`. Der Knopf „Erneut
  benachrichtigen" schickt dieselbe Mail noch einmal, ohne den Vorgang neu zu
  datieren.
- **Warenkorbbilder**: `CartItem.imagePath` hält den Storage-Pfad, nicht die
  URL – die ist signiert und nach Stunden abgelaufen, ein Warenkorb steht gern
  tagelang. Signiert wird beim Anzeigen (`lib/actions/cart-images.ts`,
  `lib/use-cart-images.ts`).
- **Adresse ist Pflicht bei der Registrierung.** Sie reist in
  `raw_user_meta_data` mit und wird vom Trigger `handle_new_user()` ins Profil
  geschrieben – ein `UPDATE` nach dem `signUp` ginge nicht, weil bei
  aktivierter E-Mail-Bestätigung an der Stelle noch keine Session existiert.
  Der Admin pflegt sie beim Anlegen eines Kunden im selben Formular mit: ein
  Telefonbesteller meldet sich womöglich nie selbst an.

---

## 📥 Wareneingang (Bestandsaufnahme)

`/admin/bestand`, Grundlage `supabase/migrations/030_wareneingang.sql`.

Beim Auspacken einer Lieferung zählt nur eins: Etikett unter den Scanner,
Stückzahl tippen, nächster Karton. Deshalb kein Formular je Artikel, sondern
eine Liste, die beim Scannen wächst, und eine Sammelbuchung am Ende.

- **Ein Weg für alles.** Bekannte und unbekannte Ware landen in derselben
  Liste – ob ein Artikel neu ist, merkt man beim Auspacken nicht. Ein
  unbekannter Code wird zur Neuanlage-Zeile (Bezeichnung, Warengruppe,
  Großhandels- und Ladenpreis Pflicht bzw. optional), ein bekannter kommt mit
  seinen Daten. Zweimal derselbe Code heißt „zwei Stück", nicht „zwei Zeilen".
- **`record_stock_entries()`** macht alles in einer Transaktion: Bestand unter
  Zeilensperre lesen und schreiben, neue Artikel samt Staffel ab 1 Stück
  anlegen, Journalzeilen setzen. Eine halb gebuchte Lieferung wäre schlimmer
  als eine gar nicht gebuchte, weil niemand wüsste, wo sie abbrach.
- **`stock_entries`** ist das Journal: der Bestand am Artikel ist eine Zahl
  ohne Gedächtnis. Hier steht, wann welche Menge dazukam, was dabei am Preis
  gesetzt wurde und wer gebucht hat. Name und Artikelnummer als Schnappschuss
  wie bei `pos_sale_items`.
- **Leeres Preisfeld heißt „unverändert"**, nicht „0". Der bisherige Preis
  steht als Platzhalter im Feld. Nur was eingetragen wird, landet am Artikel
  *und* in der Journalzeile – sonst stünde in der Historie bei jedem Zugang
  ein Preis, der nie geändert wurde.
- **Der Barcode-Notausgang**: Nach dem Scan springt der Cursor ins Mengenfeld,
  damit die Stückzahl ohne Mausgriff eingegeben werden kann. Wer dort den
  nächsten Artikel scannt, schriebe den Barcode als Menge hinein. Ab acht
  Ziffern (`BARCODE_AB_STELLEN`) wird die Eingabe deshalb als Scan behandelt
  und die alte Menge wiederhergestellt: kein Zugang hat 10.000.000 Stück,
  keine EAN ist kürzer.
- Das ausführliche Artikelformular (`/admin/products/new`) bleibt daneben für
  Fotos, Beschreibung und Staffeln und verweist oben hierher.
- **Namenssuche in der Neuanlage-Zeile** (`components/pos/pos-inline-suche.tsx`,
  über `PosProduct`/`searchPosProductsAction` – dieselbe Suche wie an der
  Kasse und im freien Preisschild-Generator, nur anderer Rückgabetyp). Nicht
  jede Rechnung hat eine EAN (Alpalium keine, Iden schon): ohne Barcode landet
  jeder Scan bei „unbekannt", auch wenn der Artikel längst im Stamm steht –
  etwa weil er selbst ohne Barcode angelegt wurde. Ein Treffer wandelt die
  Zeile an Ort und Stelle in einen bekannten Artikel um (Preise, Warengruppe,
  Bestand aus dem Treffer, die schon getippte Menge bleibt), statt eine
  Dublette unter neuem Namen anzulegen. Steht der Treffer schon als eigene
  Zeile in der Liste, gilt dieselbe Regel wie beim Scannen: zusammenlegen,
  nicht zwei Zeilen. Der ursprünglich gescannte Code wird dabei **nicht** an
  den gefundenen Artikel gehängt – ein Scan, der nicht zuzuordnen war, soll
  nicht ungeprüft zu dessen neuem Barcode werden.
- **Dieselbe Namenssuche im Kassen-Anlegedialog**
  (`components/pos/pos-new-product-dialog.tsx`, Prop `onExisting`): öffnet
  sich automatisch bei unbekanntem Scan, und auch dort ist der Code oft nur
  unbekannt, nicht die Ware. Ein Treffer schließt den Dialog und kommt direkt
  auf den Bon, ohne Neuanlage.

### Sammelimport („Liste einfügen")

`components/admin/wareneingang-import.tsx`, Regeln in
`lib/wareneingang-import.ts`. Dritter Weg neben Scanner und Namenssuche – für
die Lieferung, die mit einer Rechnung oder Preisliste kommt.

- **Warum.** Der Scanner ist unschlagbar, solange die Ware vor einem steht.
  Steht alles aber schon geschrieben auf dem Papier des Lieferanten, sind
  hundert Positionen à sechs Feldern eine halbe Schicht Abtippen – und jede
  getippte Ziffer eine Gelegenheit für einen Zahlendreher.
- **Der Import schreibt nichts.** Er füllt dieselbe Aufnahmeliste, gebucht
  wird unverändert unten über `record_stock_entries()`. Ein zweiter
  Buchungsweg liefe über kurz oder lang neben dem ersten her.
- **Feste Spaltenfolge**: `Barcode ; Bezeichnung ; Menge ; GH ; EH ; EK`.
  Trenner ist Tabulator oder Semikolon – **nie das Komma**: im deutschen
  Zahlenformat steht es im Preis, und aus „9,99" würden zwei Spalten. Eine
  mitkopierte Kopfzeile wird erkannt und übersprungen.
- **Die Zeile wird nicht als Ganzes getrimmt**, nur ihre Felder. Ein
  führender Tabulator ist eine leere erste Spalte – genau das, was aus einer
  Tabellenkalkulation kommt, wenn die Ware noch keinen Barcode hat.
  Weggetrimmt rutschte die Bezeichnung in die Barcode-Spalte.
- **Leeres Preisfeld heißt „unverändert"**, wie überall im Wareneingang.
- **Nicht lesbare Zeilen werden gesammelt angezeigt**, nicht übergangen: eine
  Lieferung, bei der drei von hundert Positionen lautlos fehlen, fällt erst
  beim Zählen im Regal auf.
- **Erst Vorschau, dann übernehmen.** Abgeglichen wird in **einer** Abfrage
  (`findProductsByCodes()` / `lookupPosProducts()`, Barcode vor Artikelnummer
  wie beim Scan) – hundert einzelne Rundreisen ließen die Oberfläche eine
  halbe Minute stehen. Die Vorschau zeigt je Zeile „Zugang · Bestand x → y"
  oder „wird angelegt".
- **Zweimal derselbe Barcode heißt „zwei Stück"**, in der Liste wie beim
  Übernehmen in die Aufnahme. Zwei Zeilen desselben Artikels ließen sich
  getrennt bepreisen, und welcher Preis am Ende am Artikel steht, hinge an der
  Reihenfolge. Zusammengelegt wird nur über den Code – zwei Zeilen ohne
  Barcode sind zwei Posten, auch wenn sie gleich heißen.

---

## 🏷️ Preisschilder fürs Regal

`/admin/preisschilder`, Grundlage `supabase/migrations/038_preisschilder.sql`
(Symbole), `039_schildgroessen.sql` (Maße) und `040_preisschild_labels.sql`
(Labelfarben). Artikel anklicken, Stückzahl
setzen, drucken – A4 mit Schnittlinien.

- **Nichts wird gespeichert außer Symbolen und Maßen.** Ein Preisschild ist
  eine Momentaufnahme; ändert sich der Preis, wird neu gedruckt. Eine abgelegte
  Schilderliste wäre eine zweite Wahrheit, die still veraltet. Bleiben müssen
  die Symbolbibliothek (`label_icons`, Bucket `products` unter `etiketten/…`)
  und die Schildgrößen (`label_sizes`) – beides Werkzeug, das über den
  einzelnen Druck hinausgeht.
- **Maße in Millimetern, frei einstellbar.** Am Regal wird gemessen, welches
  Schild in die Schiene passt, nicht ausgerechnet, wie oft es auf ein Blatt
  geht. Gepflegt werden deshalb Breite und Höhe; Spalten, Zeilen und die Zahl
  je Bogen fallen in `raster()` ab. Abgerundet und nicht gestreckt: ein Schild,
  das 64,5 mm breit sein soll, ist auf dem Papier 64,5 mm breit, und was rechts
  übrig bleibt, ist Rand. Die Alternative wäre, die eingegebenen Maße
  stillschweigend zu verändern – dann passte das ausgeschnittene Schild nicht
  mehr in die Schiene.
- **Schriftgrößen sind Anteile der Schildhöhe**, keine Tabelle je Format:
  seit die Maße frei eingegeben werden, gibt es keine feste Liste, für die man
  sie pflegen könnte. Ein doppelt so hohes Schild trägt doppelt so große
  Schrift. Preis und Fußzeile werden zusätzlich auf die Breite begrenzt –
  aus einem abgeschnittenen „1.299,0" würde ein falscher Preis.
- **`hoehenBedarf()` ist die Bremse dazu**: es rechnet, was ein voll besetztes
  Schild braucht (zweizeilige Bezeichnung, Preis, beide Haarlinien, Fußzeile).
  Zu groß geratene Anteile fielen sonst nicht auf dem Bildschirm auf, sondern
  erst auf dem abgeschnittenen Papier. Daraus folgt auch die Untergrenze von
  25 mm: darunter trägt ein Schild seine drei Angaben nicht mehr lesbar.
- **Euro groß, Cent hochgestellt** (`preisTeile()`). Nicht als Zierde: „12" in
  voller Größe und „99" halb so groß brauchen weniger Breite als „12,99", der
  Betrag kann dadurch rund anderthalbmal so groß gesetzt werden. Genau die Zahl
  liest man aus zwei Metern.
- **Streichpreis neben den Preis, Prozentfeld in den Kopf.** Beides
  untereinander kostete Höhe, die auf einem 40-mm-Schild der Preis besser
  braucht. Das Prozentfeld ist schwarz mit weißer Schrift – die einzige
  Auszeichnung, die auf weißem wie auf rotem Grund gleich stark steht.
- **Zwei Haarlinien** teilen das Schild in Kopf, Preis und Fußzeile. Sie tragen
  nichts vor, sie ordnen: drei Felder statt drei Zeilen, die im Weißraum
  schwimmen.
- **Der Bogen ist ein Route Handler** (`/admin/preisschilder/druck`), wie der
  Kassenbon und aus demselben Grund: als Seite läge er unter dem
  Verwaltungslayout und brächte Reiterleiste und Rahmen aufs Papier. **POST**,
  weil fünfzig Artikel mit Namen und Preisen keine Adresszeile überleben; die
  Werkbank schickt ein Formular mit `target="_blank"`. Übermittelt werden die
  **Maße**, nicht die Kennung der Größe: ein Bogen, der geöffnet wird, nachdem
  jemand die Größe geändert hat, käme sonst anders aus dem Drucker als in der
  Vorschau stand.
- **HTML statt PDF.** Die Schilder sind reines Rechteck-Layout, das CSS-Grid
  ohne eine Zeile Koordinatenrechnerei setzt. `print-color-adjust: exact` ist
  dabei nicht Kosmetik: ohne das druckt Chrome die roten Flächen weiß.
- **Rot heißt reduziert**, sonst weiß – die Schrift ist **weiß auf Rot,
  schwarz auf Weiß** (`rot ? "#fff" : "#000"`, dieselbe Verzweigung in
  `preisschild-vorschau.tsx` und `preisschild-bogen.ts`). Ob rot, entscheidet
  `reduzierung()` wie im Shop: ein Cent Unterschied ist kein Angebot. Die
  Fläche ist `#e2001a` und nicht das Markenrot `#a02020` – dagegen steht auch
  weiße Schrift noch deutlich ab. Der verdeckte Code hinter der Artikelnummer
  folgt derselben Umkehr: `CODEROT` auf weißem Schild, Weiß auf rotem. Nur das
  schwarze Prozentfeld bleibt unverändert schwarz mit weißer Schrift – es
  steht unabhängig von der Schildfarbe und ist auf beiden gleich stark.
- **Strichcode** in der Fußzeile rechts neben der Artikelnummer, scannbar
  (`lib/barcode.ts`, Schalter „Strichcode aufs Schild", **Vorgabe an** – ein
  scannbares Regal spart Abtippen, und der Code kostet weder Höhe noch
  Preisgröße). Ein
  Schalter für den **ganzen Bogen**, nicht je Zeile: die Fußzeile bekommt
  dadurch auf allen Schildern dieselbe Höhe, und nebeneinander auf einem Blatt
  stehen die Preise sonst auf verschiedenen Höhen. Eigener Abschnitt weiter
  unten.
- **Der verdeckte Großhandelspreis** steht als Anhängsel hinter der
  Artikelnummer: `123123#1299` für 12,99 € Einkauf (`ghCode()` – Cent, kein
  Euro-Zeichen, kein Trennzeichen). **Mindestens dreistellig**: 0,77 € ergäbe
  sonst `#77`, und das liest sich wie 77 Euro; mit führender Null steht dort
  `#077`, und drei Stellen heißen immer Euro-Euro-Cent-Cent. Auf weißem Schild
  rot, auf rotem schwarz. Leeres Feld heißt „kein Code", nicht „0 €".
- **Maße und Farben stehen in `lib/preisschild.ts`**, nicht im Bogen-Baustein:
  die Werkbank zeigt dieselbe Vorschau in Originalgröße, die der Drucker aufs
  Papier bringt (`components/admin/preisschild-vorschau.tsx`, Millimeter statt
  Tailwind-Klassen). Zwei Zahlensätze liefen auseinander, und dann wäre die
  Vorschau genau das, was sie nicht sein darf: ungefähr.
- **Schnittlinien als eigene Ebene** über dem Raster, nicht als Zellrahmen: die
  rote Fläche füllt die Zelle bis zur Kante, damit nach dem Schnitt kein weißer
  Rand bleibt. Eine Linie *innerhalb* der Zelle läge unter der Farbe und wäre
  ausgerechnet auf dem roten Schild unsichtbar. Die Ebene ist so groß wie die
  Schilder zusammen, nicht wie die Nutzfläche – auf dem Reststreifen hat keine
  Schnittlinie etwas zu suchen.
- **Rand rundum 8 mm** (`RAND` rechts/unten, `RAND_OBEN_LINKS` oben/links –
  näher kommt kein üblicher Bürodrucker an die Kante). Oben und links stand
  der Rand früher auf 0, damit die Papierkante den Schnitt ersetzte; in der
  Praxis schnitt der Drucker dort die äußere Kante der ersten Schilder ab.
  8 mm ist die größte Zahl, bei der die Einteilung der Standardformate gleich
  bleibt (Groß 72 × 56: 2 × 5 = 10 je Bogen, 5 Zeilen = 280 von 281 mm). Wer
  den Rand erhöht, verliert dort eine Zeile. Dieselbe Randverteilung steht an
  zwei Stellen – Druckbogen (`lib/preisschild-bogen.ts`) und
  Bildschirmvorschau (`components/admin/preisschild-bogen-vorschau.tsx`) – aus
  demselben Grund wie bei den Maßen: zwei auseinanderlaufende Zahlensätze
  wären eine Vorschau, die nicht mehr stimmt.
- Die letzte Seite bleibt angebrochen; leere Zellen sind weißes Papier, kein
  Fehler.
- Ein zweiter Klick auf denselben Artikel heißt „noch eins", nicht „noch eine
  Zeile" – wie beim Wareneingang. Zwei Zeilen für denselben Artikel ließen sich
  getrennt bepreisen, und das fiele erst auf dem Papier auf.
- **Bezeichnung: zwei Zeilen, voll ausgeschrieben** (`nameSatz()`). Zeile 1
  wird bis zum Rand gefüllt; passt ein Wort nicht mehr ganz, wird es dort mit
  „-" getrennt und in Zeile 2 fortgesetzt (mind. 3 Zeichen vorn, 2 hinten, nie
  mitten in einer Zahl). Reicht es nicht, wird die Schrift bis auf die Hälfte
  kleiner, erst dann gekürzt. Gemessen wird per Canvas im Browser – im
  Druckbogen läuft dieselbe Funktion, per `toString()` eingebettet. Deshalb
  darf `nameSatz()` nichts außerhalb ihres Körpers verwenden.
- **Labels** (Migration 040, `label_badge_colors`): „Neu", „Topseller" und die
  Artikel-Flags aus den Einstellungen, farbig unten rechts in der Fußzeile.
  Angelegt werden sie nicht hier, nur ihre Farbe wird gewählt und gespeichert.
  Schriftfarbe schwarz/weiß nach Leuchtdichte (`labelSchrift()`).
- **Preis und Großhandelspreis schreiben beim Verlassen des Felds in den
  Artikel zurück** (`preisSynchronisieren()`/`ghSynchronisieren()`, über
  `updateProductField()` – dieselbe Funktion wie die Inline-Bearbeitung der
  Artikelliste). Das Preisschild ist das Werkzeug, mit dem der Ladenpreis
  geändert wird, keine Kopie davon: wer hier aus 1,99 € 3,50 € macht, soll
  nicht hinterher noch einmal ins Artikelformular. **Preis und Streichpreis
  gehen als Paar** über `setzeAktionspreis()` (eine Schreibung auf
  `retail_price` + `list_price`, ausgelöst beim Verlassen eines der beiden
  Felder): mit Vorher-Preis über dem Preis steht der Artikel danach überall
  als reduziert da (Katalog, Shop, Filter, Label „Reduziert"), ohne ihn wird
  `list_price` gelöscht – ein übrig gebliebener Streichpreis hielte den
  Artikel sonst still weiter für reduziert. Früher war ein reduzierter
  Artikel hier ausgenommen; dann blieb die Aktion auf dem Papier und der
  Stamm, Katalog und Shop wussten nichts davon. Der Großhandelspreis läuft
  weiter einzeln (`updateProductField()`) – der verdeckte Code ist immer der
  tatsächliche Einkaufskanal, eine Aktion ändert daran nichts. Ausgelöst auf `onBlur`, nicht auf jeden Tastendruck:
  `NumericInput` meldet während des Tippens Zwischenstände, und jeder davon
  eine Schreibung wäre ein Preis, der mitten im Tippen kurz falsch im Stamm
  steht.
- **Die Werkbank hält den Katalog als Momentaufnahme** (`artikel`-Prop,
  einmal serverseitig geladen – „die Werkbank will den ganzen Bestand im
  Browser haben, um ohne Nachfrage filtern zu können"). Eine Preis- oder
  Großhandelsänderung landet zwar sofort in der Datenbank, die Momentaufnahme
  selbst bliebe aber auf dem alten Stand: wer die Zeile entfernt und den
  Artikel über die Suche erneut hinzufügt, bekäme sonst den alten Preis
  zurück. `preisSynchronisieren()`/`ghSynchronisieren()` rufen deshalb nach
  einer erfolgreichen Schreibung `router.refresh()` – die Momentaufnahme
  kommt frisch vom Server, ohne den Zustand der schon aufgebauten
  Schilderliste zu verlieren. `updateProductField()` revalidiert dafür
  zusätzlich `/admin/preisschilder`.

---

## ✍️ Freie Preisschilder

`/admin/preisschilder/frei`. Derselbe Bogen, dieselben Regeln, nur ohne
Artikelliste: Bezeichnung und Preis werden getippt oder über den Barcode aus
dem Artikelstamm geholt.

- **Warum zwei Generatoren.** Der Bestandsgenerator deckt das Regal ab, aber
  nicht den Rest des Ladens – Restposten, die nie erfasst wurden, ein
  Aktionsstapel vor der Tür, eine Dienstleistung an der Wand. Dafür sonst
  einen Artikel anzulegen hieße, für ein Stück Papier eine Artikelnummer ohne
  Bestand ins System zu stellen. Dieselbe Begründung wie bei der freien
  Position an der Kasse.
- **Nichts ist neu gerechnet.** Die Maske schickt ihre Zeilen an denselben
  Route Handler (`/admin/preisschilder/druck`) und setzt ihre Vorschau mit
  denselben Funktionen aus `lib/preisschild.ts`. Ein frei eingegebenes Schild
  soll im Regal neben einem aus dem Bestand stehen, ohne dass man sieht,
  welches woher kam. Ein zweiter Zeichenweg liefe über kurz oder lang neben
  dem ersten her.
- **Ausfüllen, Enter, nächstes Schild.** Das Formular ist ein `<form>` mit
  Absenden, nicht nur ein Knopf: Enter aus jedem Feld legt das Schild aufs
  Blatt. Danach wird zurückgesetzt, was zur Ware gehört (Bezeichnung, Preise,
  Nummern), nicht was zur Serie gehört (Symbol, Label) – ein stehen
  gebliebener Preis wäre ein falsch bepreistes Schild, und das fällt erst im
  Regal auf.
- **Der Fokus springt erst nach dem Neuzeichnen zurück**
  (`requestAnimationFrame`). Sofort gerufen löst er das Verlassen des eben
  getippten Zahlenfeldes aus, und `NumericInput` meldet beim Verlassen den
  Wert, der dann im DOM steht – die Stückzahl stünde nach dem Zurücksetzen
  wieder im Feld, und das nächste Schild käme ungefragt vierfach aufs Blatt.
- **Das Blatt ist die Liste** (`components/admin/preisschild-bogen-vorschau.tsx`):
  der A4-Bogen samt Rastern, verkleinert über `transform: scale()`, gezeichnet
  von derselben Komponente wie die Einzelvorschau. Der Maßstab wird gemessen
  und nicht geraten – eine Hülle in Millimetern sagt dem Skript, wie viele
  Pixel ein A4-Blatt hier breit ist. Ein Klick auf ein Schild holt es ins
  Formular zurück; „Kopie" lässt die Angaben stehen und legt sie als neues
  Schild ab, was nach einer Preisrunde der häufigste Fall ist.
- **Die Liste liegt im Browser**, nicht in der Datenbank
  (`lib/preisschild-entwurf.ts`, externer Store wie der Warenkorb). An der
  Regel „ein Preisschild wird nicht gespeichert" ändert das nichts – es gibt
  keine zweite Wahrheit auf dem Server. Ein von Hand getippter Stapel ist aber
  zu teuer, um ihn an ein versehentliches Neuladen zu verlieren; beim
  Bestandsgenerator stellen zwei Klicks dieselbe Liste wieder her.
- **Werkzeug wird nicht doppelt gepflegt**: Schildgrößen, Symbole und
  Labelfarben stehen weiter beim Bestandsgenerator und gelten hier mit. Die
  Unterleiste (`components/admin/preisschild-nav.tsx`) führt zwischen beiden
  hin und her – kein eigener Reiter in der Verwaltungsleiste, die ist voll.

### Artikelabgleich über den Barcode

Der Scan steht oben im Formular, weil er den Rest bestimmt:

| Code | Was passiert |
|------|--------------|
| bekannt | Angaben kommen aus dem Artikelstamm und das Schild liegt **sofort** auf dem Blatt |
| unbekannt | beim Ablegen wird ein Artikel angelegt (`legeSchildArtikelAn()`) |
| keiner | reines Schild – Aktionsstapel, Dienstleistung, Restposten; Namenssuche hilft |

- **Warum überhaupt anlegen.** Vorher entstand hier für neue Ware ein Zettel
  und sonst nichts: dieselben Angaben mussten danach im Artikelformular ein
  zweites Mal getippt werden, und bis dahin ließ sich die Ware weder scannen
  noch verkaufen. Dieselbe Haltung wie an der Kasse und im Wareneingang – wer
  Ware in der Hand hat, erfasst sie einmal.
- **Angelegt wird über `createQuickProduct()`**, die Anlegefunktion der Kasse:
  Artikelnummer aus dem Nummernkreis der Warengruppe, Barcode auf
  Doppelvergabe geprüft, Preisstaffel ab 1 Stück. Eine zweite Anlegeroutine
  liefe über kurz oder lang auseinander, und ein Artikel ohne Staffel hätte im
  Shop keinen Preis.
- **Ohne Großhandelspreis gilt der Ladenpreis auch als Staffelpreis.** Die
  Alternative wäre eine Staffel über 0,00 €: der Artikel stünde im Shop zum
  Nulltarif, und das fiele erst bei der ersten Bestellung auf. Ein vorläufig
  zu hoher Preis lässt sich nachziehen, eine Nullbestellung nicht
  zurückholen.
- **Nachgeschlagen wird von selbst**, 450 ms nach der letzten Eingabe und ab
  sechs Zeichen (`findPreisschildArtikel()`, Barcode vor Artikelnummer wie an
  der Kasse). Ein Abgleich, den man von Hand auslösen muss, ist genau das,
  was er nicht sein soll. Die Hintergrundabfrage bleibt stumm; Enter im
  Scannerfeld und das Verlassen des Feldes melden sich mit Ton und
  Statusleiste – sonst piepte beim Tippen einer 13-stelligen Nummer jede
  Tippause einmal „unbekannt".
- **Ein Scan, ein Schild.** Enter im Scannerfeld schickt das Formular ab;
  `uebernehmen()` schlägt den Code selbst nach und legt in einem Zug ab.
  Vorher brauchte es zwei Enter je Artikel – eines zum Nachsehen, eines zum
  Ablegen –, und bei einem Regal voll Ware ist das ein Tastendruck zu viel
  pro Artikel. Der alte Abbruch sollte verhindern, dass ein ungeprüfter Preis
  gedruckt wird; dieser Schutz wandert von „vor dem Ablegen" nach „vor dem
  Drucken": das Blatt ist die Liste, jedes Schild steht dort in
  Originalmaßen, ein Klick holt es zurück, gedruckt wird erst auf Knopfdruck.
- **Der Fokus kehrt nach jeder Aktion zurück, die ein Scan ausgelöst hat –
  aber nur dorthin.** `zurueckZumFeld()` zielt standardmäßig aufs Scannerfeld,
  weil ein Handscanner meldet sich wie eine Tastatur: was er sendet, landet
  im gerade fokussierten Feld, nicht zwingend im Scannerfeld. Jede Stelle, die
  nach einem Scan **woanders** hinfokussiert (etwa die Namenssuche, die „weiter
  zum Preis" springt, wenn ein Treffer die nächste Frage „stimmt er noch?"
  aufwirft), darf das nur tun, wenn gerade **kein** Scan im Gang war – sonst
  tippt der nächste physische Scan seine Ziffern ins falsche Feld und ein
  Enter reißt mitten in der Eingabe das halbfertige Schild los. Genau das
  brach einmal, als die Namenssuche auch bei unbekanntem Code aktiviert wurde:
  der Fokus sprang weiter ins Preisfeld, obwohl gerade am Scanner gestanden
  wurde, und der nächste Scan landete dort statt im Scannerfeld.
- **Abgelegt wird aus dem Rückgabewert des Abgleichs**, nicht aus dem
  Formularzustand: `setEntwurf()` ist innerhalb derselben Funktion noch nicht
  wirksam, und das Schild käme mit der alten, womöglich leeren Bezeichnung
  aufs Blatt. `alsEntwurf()` baut die Werte, `uebernehmeArtikel()` ist nur
  noch für die Anzeige zuständig.
- **Zweimal derselbe Code heißt „zwei Stück".** `legeAb()` erhöht die
  Stückzahl eines vorhandenen Eintrags mit derselben **Artikelnummer**, statt
  eine Zeile anzuhängen – sonst wären zweimal scannen zwei Zeilen, die sich
  getrennt bepreisen lassen, und das fiele erst auf dem Papier auf. Über die
  Nummer und nicht über die Bezeichnung: zwei frei getippte Schilder mit
  gleichem Wortlaut und verschiedenen Preisen sind zwei Schilder, und ein
  Schild ohne Nummer wird nie zusammengelegt.
- **Abgeglichen wird nur ein neues Schild.** Wer ein Schild nachträglich
  ändert, korrigiert Papier – daraus einen Artikel anzulegen wäre eine
  Nebenwirkung, mit der niemand rechnet. Gilt für **alle** Auslöser eines
  Abgleichs – Namenssuche, Hintergrundabfrage beim Tippen *und* das Verlassen
  des Barcode-Felds –, nicht nur für den Scan selbst: ein Code im Feld eines
  gerade bearbeiteten Schilds (`bearbeitet`) löst keinen Abgleich aus. Fehlte
  diese Grenze bei den letzten beiden, überschrieb ein Scan oder eine
  Korrektur im Barcode-Feld während der Bearbeitung lautlos Name, Preise und
  `productId` des bearbeiteten Schilds mit denen eines fremden Artikels –
  „Änderung übernehmen" schrieb den dann unter der ursprünglichen Kennung auf
  den Bogen, und das sah aus wie ein verschwundenes Schild.
- **Namenssuche im Bezeichnungsfeld**
  (`components/admin/preisschild-artikel-suche.tsx`,
  `sucheSchildArtikelNachName()` auf `getPreisschildArtikel()`): schwebende
  Trefferliste, Pfeiltasten, ab zwei Zeichen, 250 ms Ruhe. Für Ware ohne
  lesbares Etikett – sie steht trotzdem im Stamm, und Bezeichnung samt
  Preisen abzutippen ist genau die Doppelarbeit, die der Abgleich abschafft.
  **Bei leerem Scannerfeld oder bei einem Code, der sich schon als unbekannt
  herausgestellt hat** (`unbekannt`): steht ein Code noch nicht fertig
  abgeglichen im Feld, bleibt die Suche aus – ein Vorschlag wäre sonst eine
  Einladung, einen zweiten Artikel unter dem Code des ersten zu wählen, und
  neue Ware unter dem Datensatz einer alten ist der teuerste Fehler, den die
  Maske zulassen kann. Ohne Treffer erscheint nichts; das Feld ist in erster
  Linie ein Eingabefeld. Eine Auswahl setzt `aufgeloest`/`treffer` mit, sonst
  hielte `uebernehmen()` den Artikel für unbekannt und legte ihn ein zweites
  Mal an.
- **Ein unbekannter Code trägt den Treffer nach, statt einen zweiten Artikel
  zu bekommen.** Nicht jede Rechnung hat eine EAN (Alpalium keine, Iden
  schon) – ein Artikel ohne Barcode scannt sich beim nächsten Mal trotzdem
  nicht von selbst. Wählt die Namenssuche bei einem unbekannten Code einen
  Artikel **ohne** gepflegten Barcode, schreibt `updateProductField()` den
  gescannten Code auf diesen Artikel; der nächste Scan findet ihn direkt. Hat
  der gewählte Artikel schon einen anderen Barcode, bleibt der unangetastet –
  `uebernehmeArtikel()` setzt das Feld dann ohnehin auf dessen eigenen Code
  zurück, und einem Artikel die Nummer eines anderen unterzuschieben wäre der
  nächste teure Fehler.
- **Jeder neue Artikel bekommt eine Artikelnummer**, immer aus dem
  Nummernkreis der Warengruppe (`next_sku()`) und nie aus einem Feld. Die
  `sku` auf dem Schild liest `uebernehmen()` grundsätzlich aus dem Stamm.
- **Signale und Tastatur-Wächter** wie an der Kasse (`useKassenMeldung()`,
  `useScanFocus()`): Statusleiste über dem Feld, Ton je Vorgang. Der Wächter
  pausiert, solange eine Abfrage läuft – käme der zweite Scan mitten in die
  Antwort des ersten, stünden die Angaben des einen Artikels unter dem Code
  des anderen.
- **Preis und Großhandelspreis schreiben in den Artikel zurück, sobald ein
  Schild zu einem Artikel gehört** – dieselben
  `preisSynchronisieren()`/`ghSynchronisieren()` wie im Bestandsgenerator.
  Preis und Streichpreis werden als Paar geschrieben (`setzeAktionspreis()`),
  der Großhandelspreis einzeln – gleiche Begründung wie dort.
  **Maßgeblich ist `entwurf.productId`, nicht `gefunden`.** `gefunden` ist
  nach `bearbeiten()` immer `null` (das zurückgeholte Schild wird nicht noch
  einmal abgeglichen), aber genau dort soll eine Preiskorrektur ebenfalls
  zurückgeschrieben werden – wer ein abgelegtes Schild korrigiert, korrigiert
  meist auch den tatsächlichen Preis. `productId` ist deshalb ein eigenes Feld
  an `FreiesSchild`/`Entwurf`, das `alsEntwurf()` beim Treffer setzt und
  `bearbeiten()` beim Zurückholen erhält – anders als `sku` (Text fürs Papier,
  frei änderbar) bleibt es die verlässliche Kennung für den Rückschreibpfad.
  `bearbeiten()` setzt `basisPreis`/`basisGh` dabei auf den Stand **des
  Schilds**, nicht auf den eines früheren, womöglich ganz anderen Treffers.
  Abgesehen davon und vom nachgetragenen Barcode (siehe oben) ändert sich am
  Artikel nichts.

---

## 📖 Kataloge

`/admin/kataloge`, Grundlage `supabase/migrations/051_kataloge.sql`. Artikel
zu einem Katalog zusammenstellen – Gesamtsortiment oder Aktionsheft – und als
A4-Dokument drucken oder über den Druckdialog als PDF sichern.

- **Gespeichert wird nur Auswahl und Einstellung** (`catalogs`,
  `catalog_items`), nie Preis, Bezeichnung oder Foto. Jede Ausgabe liest
  frisch aus dem Artikelstamm – dieselbe Regel wie beim Preisschild. Die
  Zusammenstellung von diesem Monat ergibt nächsten Monat den Katalog mit den
  Preisen von nächstem Monat.
- **`lib/katalog.ts` ist die eine Stelle, die entscheidet**, was gedruckt wird,
  zu welchem Preis und auf welcher Seite (`katalogAufbau()`). Werkbank und
  Bogen rufen beide dieselbe Funktion; die Datei importiert deshalb nichts,
  was nur auf dem Server läuft. Zwei Rechenwege wären eine Seitenzahl in der
  Werkbank, die nicht zum Papier passt. Geprüft über
  `node --experimental-strip-types scripts/katalog-check.mjs`.
- **Der Bogen ist ein Route Handler** (`/admin/kataloge/[id]/druck`,
  `lib/katalog-bogen.ts`), HTML plus Druckdialog wie Kassenbon und
  Preisschild-Bogen. **GET**, weil die Auswahl in der Datenbank steht;
  `?druck=0` ist die Vorschau. pdf-lib wurde verworfen: drei Raster mal zwei
  Stile wären sechs handgesetzte Layouts, und WebP-Fotos gingen nicht.
- **Umbruch in Einheiten, feste Höhen, geklemmter Text.** Eine Seite hat 24
  Einheiten (Liste 40), eine Kachel 6, eine große Zelle 8, eine Listenzeile 2
  (`RASTER`). Nur weil nichts mit seinem Inhalt wächst, ist der Umbruch
  rechenbar, bevor ein Browser gesetzt hat – und nur dann stimmen die
  Seitenzahlen im Inhaltsverzeichnis. Der Bogen setzt jeden Block mit
  `grid-row`/`grid-column` genau dorthin, wo `katalogAufbau()` ihn hingelegt
  hat, und trifft selbst keine Umbruchentscheidung.
- **Jede Zelle ist gleich aufgebaut**: eine leere Angabe (keine Merkmale,
  keine Beschreibung) lässt ihren Platz frei. Rückte der Rest nach, stünden
  die Preise einer Zeile auf verschiedenen Höhen.
- **Drei Preisarten**: Großhandel (netto, Staffeln), Ladenpreis, ohne Preise.
  **Bei „Ladenpreis" kein Rückfall auf die Staffel** – anders als an der
  Kasse. Ein Großhandelspreis unter „inkl. USt." stünde auf Papier, das sich
  nicht zurückholen lässt. Reduzierung nur über `reduzierung()`.
- **Der Einkaufspreis wird gar nicht geladen** (`lib/queries/kataloge.ts`).
  Was nicht im Browser ankommt, kann nicht versehentlich gedruckt werden.
- **Was fehlt, fehlt sichtbar**: ohne Foto oder ohne Preis der gewählten
  Preisart steht ein Artikel nicht im Katalog; die Werkbank zählt beides in
  einer anklickbaren Leiste und markiert die Zeile. Ausverkauft und im Shop
  ausgeblendet sind nur Hinweise – der Katalog gilt Wochen, der Lagerstand
  Stunden, und der Bestand wird nicht gedruckt.
- **Ausführungen falten zu einem Angebot** über die volle Breite (Foto links,
  Tabelle rechts) – aber nur die Mitglieder, die im Katalog stehen. Beim Foto
  gilt die Gruppe: eine Ausführung ohne eigenes Bild bleibt, solange eine
  andere eins hat. Steht die Rasterzeile vor dem Angebot erst halb voll, wird
  sie mit den folgenden Einzelartikeln aufgefüllt, sonst bliebe ein Loch. Ein
  Angebot, höher als eine Seite, wird zwischen zwei Ausführungen geteilt.
- **Warengruppe hinzufügen schreibt Einzelzeilen**, keine Verknüpfung
  „Katalog enthält Gruppe". Der Katalog soll nicht ungefragt wachsen, wenn am
  Tag vor dem Druck jemand drei Artikel anlegt; „Gruppe auffüllen" holt sie
  ausdrücklich nach.
- **Zwei Stile, gleiche Maße**: „sachlich" und „Prospekt" unterscheiden sich
  nur in Farbe und Gewicht. Bekäme der Katalog beim Umschalten eine andere
  Seitenzahl, wäre er nicht mehr dasselbe Dokument. Für beide gilt: keine
  Verläufe, Schatten, Rundungen, Symbole; Maße in mm und pt.
- **Inhaltsverzeichnis erst ab acht Seiten** (`INHALT_AB_SEITEN`), sonst wäre
  es eine Seite Papier für drei Zeilen.
- **Fotos über den Bildoptimierer** (`/_next/image`, Breite je Raster), nicht
  als Original: dreihundert Originale ergäben ein PDF, das sich nicht
  verschicken lässt. Das Original reist als `data-roh` mit und wird
  nachgeladen, falls der Optimierer die Adresse ablehnt. Der Druckdialog
  öffnet erst, wenn alle Bilder da sind, spätestens nach 15 Sekunden.
- **Strichcode als ein SVG-Pfad** je Code (`lib/barcode.ts`), immer schwarz
  auf Weiß; unter `MODUL_MIN` oder bei ungültiger Nummer steht keiner.
- **Kein Speichern-Knopf in der Werkbank**: jede Änderung geht sofort als
  Action hinaus (`lib/actions/kataloge.ts`, je Feld ein Zod-Schema) und wird
  zurückgenommen, wenn sie scheitert. Textfelder speichern beim Verlassen.
- Abfragen blättern über die 1000-Zeilen-Grenze von PostgREST hinaus.

## ▮▯ Strichcode auf dem Preisschild

`lib/barcode.ts`. EAN-13, EAN-8 und UPC-A, gezeichnet als Modulfolge und
nicht als Bild.

- **Eigener Encoder, keine Bibliothek.** Die Schilder entstehen an zwei
  Stellen – Druckbogen auf dem Server, Vorschau im Browser –, eine Bibliothek
  müsste in beide Bündel. Drei Symbologien sind drei Tabellen à zehn Zeilen.
  Die Ausgabe ist gegen die Decoder aus `@zxing/library` geprüft, und zwar
  bis zurück aus dem gerenderten DOM: die gemessenen Strichbreiten ergeben
  wieder dieselbe Nummer.
- **In der Fußzeile, rechts neben der Artikelnummer** – kein eigener Block
  unter dem Schild. Ein vierter Streifen kostete Höhe, die der Preis besser
  braucht, und machte aus einem ruhigen Schild ein volles. Die Striche sind
  so hoch wie die Artikelnummer daneben; ein Handscanner liest auch einen
  niedrigen Code, solange er gerade draufhält.
- **Auf farbigem Grund liegt er auf Weiß** (`barcodeKasten()`), auf weißem
  Schild gar nicht. Die Striche direkt aufs rote Aktionsschild zu setzen ist
  in der Praxis durchgefallen: die Handscanner im Laden lesen sie dort nicht.
  Die Theorie – rotes Laserlicht sieht Rot wie Weiß – hilft nicht, wenn das
  Gerät ein Kamerascanner ist, und die rund 4:1 Helligkeitsunterschied zu
  Schwarz reichen ihm nicht. Der Rand wird auf beiden Schildarten reserviert,
  damit rote und weiße Schilder desselben Bogens gleich aufgebaut sind.
- **Der Rand liegt außen** um die Striche. Ein Innenabstand würde bei
  `box-sizing: border-box` vom Platz der Striche abgezogen, und der Code käme
  gestaucht aus dem Drucker.
- **Module statt Bild.** Wie breit ein Modul auf dem Papier wird, entscheidet
  erst das Schild (`barcodeMasse()`), nach oben begrenzt aufs Nennmaß
  `MODUL_NENN` (0,33 mm). Ein fertiges PNG müsste skaliert werden, und ein auf
  krumme Faktoren skalierter Strichcode ist genau das, was Scanner nicht mehr
  lesen. Unter `MODUL_MIN` (0,26 mm) warnt die Werkbank – gedruckt wird
  trotzdem; unter `MODUL_HART` (0,16 mm) gar nicht mehr, dort verschmelzen
  benachbarte Striche schon im Druckbild.
- **Ruhezonen gehören zum Code**, nicht zum Rand: sie stecken als helle
  Module in `Barcode.breite` und sind damit Teil der weißen Fläche.
- **Breitenaufteilung der Fußzeile**: das Label behält sein Maß, der
  Strichcode nimmt sich davon höchstens `BARCODE_ANTEIL` (55 %) und nie so
  viel, dass der Artikelnummer weniger als `KENNUNG_ANTEIL` (28 %) bleibt.
  Die Zelle schneidet Überstehendes ab, und eine abgeschnittene Artikelnummer
  ist eine falsche Artikelnummer. Ein breites Label („TOPSELLER") lässt
  deshalb auf kleinen Formaten keinen Code übrig – dann steht keiner da.
- **`labelBreite()` und `kennungSchriftgroesse()` schätzen absichtlich nach
  oben** (0,72 bzw. 0,58 em je Zeichen). Beide Schätzungen entscheiden, wie
  groß die Artikelnummer gesetzt wird; liegen sie zu niedrig, steht am Regal
  „110002#120" statt „110002#1200".
- **Falsche Prüfziffer wird nicht berichtigt**, sondern der Code weggelassen:
  sonst stünde eine andere Nummer auf dem Schild als im Artikelstamm. Eine
  ganz fehlende Prüfziffer (12 bzw. 7 Ziffern) wird ergänzt – das ist keine
  Änderung, sondern dieselbe Nummer vollständig.
- **Klartext-Rückfall nur bei einer Nummer, die kein EAN ist.** Wurde der Code
  bloß aus Platzmangel weggelassen, hilft die Ziffernfolge niemandem: sie ist
  dreizehnstellig und stünde in der Restbreite in Ameisengröße da.
- **Platz kommt notfalls vom Preis.** `schildMasse(format, { barcode: true })`
  nimmt den Preisblock schrittweise zurück, bis `hoehenBedarf()` wieder in die
  Schildhöhe passt. In der Praxis greift das nicht mehr, seit der Code in der
  Fußzeile steht – die Bremse bleibt für frei eingegebene Maße.
- **Kein Code 128.** Die Ware im Laden trägt EAN; eine 107-Zeilen-Tabelle,
  die niemand nachrechnet, wäre ein Risiko für den einen Artikel mit
  Buchstaben im Feld. Was kein EAN ist, steht wie bisher als Ziffernfolge
  hinter der Artikelnummer (`schildKennung()`).

---

## 📈 Umsatzübersicht

`/kasse/umsaetze`. Was am Tagesabschluss fehlt: dort steht ein Monat je Seite,
weil die Z-Nummern in Monatsblöcken geführt werden. Hier steht der Zeitraum
vorn und die Auflösung daneben.

- **Zeitraum** über Presets (heute, gestern, Woche, Monat, Vormonat, Jahr,
  alles) oder zwei Datumsfelder; aufgelöst in `lib/kassen-zeitraum.ts`, immer
  auf Kassentagen in Ladenzeit und nie auf selbstgerechneten UTC-Fenstern.
  Eigene Daten schlagen das Preset.
- **Auflösung** je Tag oder je Monat. Die Monatszeilen sind die Summe der
  Tageszeilen aus `pos_day_totals` – zwei Wege zu derselben Zahl wären zwei
  Wege, sie unterschiedlich zu bekommen.
- **Z-Bon je Tag** direkt in der Liste; ein Tag ohne Abschluss zeigt
  stattdessen den Abschlussknopf. Der Z-Bon selbst liegt unverändert unter
  `/kasse/tagesabschluss/[datum]/bon`.

---

## 🔢 Zahlenfelder

`components/numeric-input.tsx` (Tabellen) und `components/quantity-input.tsx`
(Warenkorb, mit Plus/Minus) lösen dasselbe Problem: ein `value={zahl}` mit
`Number(...) || 0` im `onChange` lässt sich nicht leeren. Die Rücktaste macht
aus dem Feld sofort eine `0`, und aus einer danach getippten 20 wird `020`.
Beide halten deshalb den Eingabetext als eigenen Entwurf; leer ist erlaubt,
gerundet wird beim Verlassen des Feldes. Neue Zahlenfelder nehmen eine der
beiden Komponenten – nicht `<Input type="number">` mit Zahl im State.

---

## 🔤 Wortweise Suche im Artikelstamm

`lib/search.ts`, `sucheWortweise()`. Jede Suche nach Artikeln lief vorher
phrasenweise: der ganze Suchbegriff musste als zusammenhängender Teilstring
in Name, SKU oder Barcode stehen. „alpalium 16er" fand damit nichts, obwohl
der Artikel „ALPALIUM Super Heavy Duty R03/AAA, 16er Blister" heißt – beide
Wörter stehen drin, nur nicht nebeneinander.

- **Jedes Wort bekommt eine eigene `.or()`-Bedingung.** PostgREST (und damit
  supabase-js) UND-verknüpft mehrere `.or()`-Aufrufe auf derselben Abfrage
  automatisch, innerhalb eines Aufrufs bleibt es ODER – siehe auch
  `neuheitenFilter()` in `lib/queries/products.ts`, die sich auf genau dieses
  Verhalten verlässt. Ergebnis: jedes Wort muss irgendwo in einer der
  angegebenen Spalten stehen, in beliebiger Reihenfolge, aber alle Wörter
  müssen treffen.
- **An jeder Stelle gleich**, nicht nur dort, wo es gerade auffiel:
  Admin-Artikelliste, Wareneingangsjournal, Preisschild-Werkbank und
  Namenssuche im freien Generator, Kassen-/Wareneingangs-Namenssuche
  (`PosInlineSuche`, `PosProductSearch`), Shop-Suche. Eine Stelle, die
  phrasenweise sucht, und eine andere wortweise, wäre zwei Verhalten für
  dieselbe Erwartung.
- **Sanitizing bleibt beim Aufrufer.** `sucheWortweise()` bekommt den schon
  bereinigten Begriff (Sonderzeichen wie `,()*\%` raus) – jede Stelle hatte
  ihr eigenes Sanitizing schon vorher, meist mit leicht unterschiedlichen
  Zeichenklassen, und das anzugleichen stand hier nicht zur Debatte.

---

## 🔎 Schnellfilter der Artikelliste

`lib/admin-product-filter.ts`. Sechs Fragen, die im Laden täglich anfallen –
ausverkauft, Bestand knapp, ohne Barcode, ohne Ladenpreis, ohne Staffelpreis,
reduziert – als Kachelreihe über der Tabelle.

- **Gefiltert wird in der Anwendung**, nicht in der Abfrage. Zwei der Fragen
  ließen sich über PostgREST gar nicht stellen: der freie Bestand rechnet über
  zwei Spalten, die Reduzierung über die Preisstaffeln. Und die Kachel soll
  ihre Zahl auch dann zeigen, wenn nicht nach ihr gefiltert wird – ein Filter
  in der Abfrage hätte die Grundmenge schon weggeworfen.
- **UND-verknüpft**: zwei Kacheln zusammen meinen die Schnittmenge. Ein ODER
  brächte eine längere Liste statt einer kürzeren und wäre das Gegenteil eines
  Filters. (Die Flag-Auswahl darüber bleibt ODER – dort sucht man „neu *oder*
  Topseller".)
- Die Kacheln sind Links, keine Kästchen im Suchformular: eine Frage wie „was
  ist alle?" soll ein Klick beantworten. Das Formular führt sie als versteckte
  Felder mit, damit eine Suche die Auswahl nicht verwirft.
- **Sortierung** daneben im Suchformular (`ADMIN_PRODUCT_SORT` in
  `lib/queries/admin.ts`): Name A–Z als Vorgabe, „Neueste zuerst" und
  „Älteste zuerst" über `created_at`. Anders als die Kacheln läuft sie in der
  Abfrage – das Datum steht in der Zeile und muss nicht erst gerechnet werden.
  Bei Datumssortierung blendet die Zeile das Aufnahmedatum ein; immer sichtbar
  wäre es eine Spalte Rauschen.

---

## 🔔 Signale der Kasse

`components/pos/use-kassen-ton.ts` und `components/pos/kassen-status.tsx`.
Kasse *und* Wareneingang benutzen beides.

An der Kasse liegt der Blick auf der Ware, nicht auf dem Bildschirm. Ein
einziger Piep für jeden Ausgang hieße, doch wieder hinzusehen. Es gibt deshalb
sechs Signale, hörbar und sichtbar:

| Signal | Wann | Ton |
|--------|------|-----|
| `treffer` | Artikel steht auf Bon/Liste | vertrauter Ladenpiep (`public/sounds/scanner-beep.mp3`) |
| `unbekannt` | Code ohne Treffer → Anlegen | zwei Töne abwärts |
| `neu` | Artikel angelegt (und gebucht) | drei Töne aufwärts |
| `warnung` | Bestand reicht nicht, Pflichtfeld fehlt | tiefer Doppelton |
| `fehler` | Buchung oder Abfrage gescheitert | zwei tiefe lange Töne |
| `abschluss` | Verkauf bzw. Lieferung gebucht | Dreiklang aufwärts |

- **Ton und Anzeige aus einer Hand**: `useKassenMeldung()` liefert `melden()`,
  das beides setzt. Getrennt geführt klänge irgendwann ein Fehler wie eine
  Buchung.
- **Der Ladenpiep bleibt eine Datei**, alles andere wird im Browser erzeugt
  (WebAudio). Sonst bräuchte jedes Signal eine gepflegte Tondatei, und die
  Töne wären nur so verschieden wie die Aufnahmen.
- **Statusleiste statt Toast**: sie steht fest über dem Scannerfeld, in
  Blickrichtung, und bleibt acht Sekunden. Eine Meldung am Bildschirmrand ist
  weg, bevor jemand hinsieht. Ohne Vorgang steht dort „Bereit" – eine Leiste,
  die kommt und geht, verschöbe bei jedem Scan den Bon.

---

## 🖼️ Warengruppen auf der Startseite

`components/category-grid.tsx`, Bilder aus `categories.image_path`
(Migration 031) oder – ohne Kachelbild – bis zu drei Artikelfotos der Gruppe
(`LandingCategory.vorschau`).

- **Bild an der Warengruppe, nicht im Quelltext**: gepflegt wird es unter
  `/admin/categories` (`components/admin/category-image.tsx`). Hochgeladen
  wird direkt aus dem Browser in den Bucket `products` unter
  `kategorien/<id>/…`; die Server Action bekommt nur den Pfad.
- **Raster statt Bildreihe**: alle Warengruppen auf einen Blick, Fläche in
  der Warengruppenfarbe aus `lib/accent-colors.ts` (dieselbe wie in
  Filterspalte und Artikelliste). Die frühere Scroll-Reihe zeigte nur, was
  hineinpasste, und bei Gruppen ohne Bild eine leere Fläche.
- Darunter drei **Schnellwege** zu Reduziert, Neuheiten, Topseller.

---

## 🏠 Aufbau der Startseite

`app/page.tsx`, Daten aus `getLandingData()`. Reihenfolge:
Schnellleiste → Kopfbereich (Auslage) → Katalogband → Warengruppen → **Reduziert** →
Sortiment mit Reitern je Warengruppe → Neu und gefragt (Neuheiten und
Topseller nebeneinander) → Portalvorteile → **Häufige Fragen** → Über uns →
Kontakt.

- **Jeder Abschnitt eine eigene Fläche** (Navy, Blau getönt, Rot getönt,
  Weiß, Gold getönt …). Eine durchgehend weiße Seite ließ die Abschnitte
  ineinanderlaufen.
- **Reduziert** steht über dem Sortiment und trägt ein rotes Aktionsfeld
  („bis −xx %"): auch ein einzelner reduzierter Artikel füllt die Zeile.
  `LandingData.reduziert` ist nach Ersparnis sortiert, gezählt wird nur, was
  `reduzierung()` übrig lässt.
- **Sortiment-Reiter** (`components/sortiment-tabs.tsx`): Karten rendert der
  Server, der Client schaltet nur um. Keine Artikeldaten als JSON im Browser.
- **Neuheiten und Topseller als Listenzeilen** (`components/catalog-row.tsx`)
  nebeneinander – zwei kurze Listen füllen eine Zeile, zwei Bahnen wären
  zweimal Leerraum.
- **Angemeldete Kunden** sehen statt Registrierungsaufrufen „Meine
  Bestellungen" und „Zum Warenkorb".
- **Häufige Fragen** stehen vor „Über uns": die wichtigsten acht offen, der
  Rest hinter einem Aufklapper, darunter der Weg zu `/faq`. Die nächste Frage
  eines Besuchers ist meist eine von diesen, und für eine einzelne Antwort
  soll niemand die Startseite verlassen müssen.
- **Bewegung** in `app/globals.css` (Abschnitt „Startseite und
  Hinweisleiste"): wandernde Farbfelder und schwebende Auslage im Kopf,
  Goldstrich unter Überschriften, Puls am Prozentzeichen, gestaffelter
  Auftritt der Reiterkarten. Alles steht bei `prefers-reduced-motion`.

---

## 📣 Hinweisleiste

`supabase/migrations/035_hinweisleiste.sql`, Tabelle `site_banners`,
gepflegt unter `/admin/settings`
(`components/forms/site-banners-settings.tsx`).

- Farbige Leiste **über** der Kopfleiste (`components/announcement-bar.tsx`,
  geladen von `components/site-banner.tsx` im Wurzellayout). Mehrere aktive
  Hinweise wechseln sich alle 5,5 s ab, beim Draufzeigen hält der Wechsel an.
- Fläche `brand`, `gold` oder `signal` – kein freies Hex, die Leiste bleibt in
  der Markenpalette. Gold trägt dunkle Schrift (Kontrast).
- Link optional: interner Pfad (`/shop/reduziert`) oder `https://…`; alles
  andere weist die Action ab.
- **Nicht in `/admin` und `/kasse`** – dort wird gearbeitet.
- Gelesen über den öffentlichen Client, RLS gibt Besuchern nur aktive Zeilen.
  Fehlt die Tabelle, zeigt die Leiste den Versandhinweis als Vorgabe.

---

## 🔻 Route „Reduziert"

`/shop/reduziert`. Anders als Neuheiten und Topseller kein Flag, sondern der
Filter `onlyReduced` (`?rabatt=1`, `lib/shop-filters.ts`), ausgewertet über
`reduzierung()` im `FilterAdapter`. Steht auch als Kennzeichen in der
Filterspalte und als Reiter in der Kopfleiste (für Admins erst ab `xl`, sonst
passen die Reiter nicht neben das Benutzermenü).

Aktiv ist in der Kopfleiste immer nur der **spezifischste** Reiter: auf
`/shop/reduziert` leuchtet nicht zusätzlich „Sortiment".

---

## ❓ Häufige Fragen

Die Fragen stehen **einmal** in `lib/faq.tsx` und werden an zwei Orten
gezeigt: `/faq` vollständig, die Startseite gekürzt auf die mit
`wichtig: true`. Zwei gepflegte Listen liefen auseinander – eine Änderung am
Zahlungsziel hätte man an einer Stelle nachgezogen und an der anderen
vergessen, und dann widersprächen sich zwei Seiten derselben Website.

- **`components/faq-liste.tsx`** rendert beide. Aufgeklappt wird über
  `<details>`: kein Skript, läuft ohne JavaScript, und die Browsersuche findet
  auch zugeklappte Antworten.
- **Benannte Tailwind-Gruppe** (`group/frage`): auf der Startseite steckt die
  Liste selbst in einem `<details>`. Mit einer namenlosen `group` drehte dessen
  offener Zustand auch alle Pfeile darin, und zugeklappte Fragen sähen offen
  aus.
- **Im Wartungsmodus erreichbar**: `/faq`, `/kontakt` und `/versand` stehen in
  `MAINTENANCE_EXEMPT_PREFIXES` (proxy.ts). Die Fußzeile bleibt unter dem
  Wartungsscreen stehen; ohne die Ausnahme führte jeder ihrer Links zurück auf
  die Wartungsseite und sah aus wie ein toter Link. Preise, Bestände und
  Konten gibt keine dieser Seiten heraus.

---

## ⚖️ Impressum

`/impressum`, gepflegt unter `/admin/settings`
(`components/forms/impressum-settings.tsx`), Regeln in `lib/impressum.ts`,
Grundlage Migration 045.

- **Abschnittsliste** in `company_settings.impressum` (JSONB,
  `[{titel, text}]`): frei anlegen, umstellen, löschen. `NULL` heißt „nie
  gepflegt" → `IMPRESSUM_VORLAGE`; eine leere Liste ist etwas anderes.
- **Platzhalter** wie `{firma}`, `{anschrift}`, `{ustid}`,
  `{registergericht}` füllt `fuelleImpressum()` aus den Firmendaten – eine
  Anschrift wird einmal gepflegt, nicht in Rechnung *und* Impressum. Fehlt
  ein Wert, steht `[Registergericht]` da: eine Lücke muss auffallen.
- Registergericht und -nummer sind eigene Felder in `company_settings`.
- Gelesen über `public_impressum()` (SECURITY DEFINER): gibt USt-IdNr. frei,
  Steuernummer und Bankdaten nicht.

---

## ☎️ Kontaktdaten für Besucher

`public_company_contact()` (Migration 036) gibt Firmenname, Anschrift,
Telefon, E-Mail und Webseite aus `company_settings` frei – sonst nichts.
`company_settings` selbst bleibt nur für Angemeldete lesbar (Bankdaten).
Gelesen über `getPublicContact()` in Fußzeile und Startseite; fehlt ein Wert,
steht der `[ … ]`-Platzhalter da.

---

## 🧾 Bonfrage nach dem Kassieren

Der Abschlussdialog der Kasse fragt bei **Einzelhandelspreisen** in der
Überschrift „Bon drucken?" und trägt den Druckknopf über die volle Breite;
„Ohne Bon weiter" steht daneben. Bei **Großhandelspreisen** entfällt die
Frage – ein Händler mit Konto bekommt ohnehin eine Rechnung, ihn danach zu
fragen wäre eine Frage zu viel. Dort ist „Nächster Verkauf" der Hauptweg, Bon
und PDF stehen kleiner darunter.

Der Dialog benutzt eine eigene Fußzeile statt `DialogFooter`: der reiht die
Knöpfe in einer Zeile, und drei davon liefen im Kassenfenster rechts aus dem
Rahmen.

---

## 🪟 Schaufenster der Startseite

Die vier Bilder im Kopfbereich kommen aus `LandingData.schaufenster`:
reduzierte Artikel, Topseller und Neuheiten zuerst, bei **jedem Aufruf neu
gemischt** (Fisher-Yates in `lib/queries/products.ts`, nicht
`sort(() => Math.random() - 0.5)` – das mischt nachweislich schlecht).

- **Aufgefüllt wird aus dem gemischten übrigen Katalog**, nicht aus einer
  festen Liste. Das ist kein Randfall: solange kaum ein Artikel als Topseller
  oder Neuheit markiert ist, stünden sonst bei jedem Aufruf dieselben vier
  Bilder da, obwohl gemischt wird. Erst wenn genug markiert ist, füllt der
  Rest gar nicht mehr auf.
- Gemischt wird **vor** dem Abschneiden auf 16 Kandidaten, damit über die Zeit
  das ganze Feld drankommt. Die Zahl begrenzt, wie viele Bild-URLs signiert
  werden müssen – der teure Teil der Abfrage.
- Ein gepflegter `list_price` ist nur der Verdacht auf eine Reduzierung; ob
  eine übrig bleibt, entscheidet `reduzierung()` mit den Staffelpreisen. Wird
  keine daraus, verliert der Artikel seinen Vorrang und rutscht in den
  Auffüllteil.
- Ohne Foto taugt ein Artikel nicht fürs Schaufenster.
- **Bezeichnung und Preis stehen fest unter dem Foto**, nicht erst beim
  Draufzeigen: ein Händler entscheidet am Bild, ob das Sortiment passt, und am
  Preis, ob es sich rechnet. Auf dem Telefon gibt es kein Draufzeigen – dort
  war die Angabe vorher gar nicht zu sehen. Reduzierte Artikel zeigen den
  Signalpreis mit Streichpreis, sonst „ab … netto".

---

## 🎨 Merkmale von Artikeln

`supabase/migrations/032_merkmale.sql`. Drei Ebenen, weil die Werte gepflegt
und nicht getippt werden:

| Tabelle | Inhalt |
|---------|--------|
| `product_attributes` | „Farbe", „Größe", „Material" – `kind` ist `color` oder `text` |
| `product_attribute_values` | „Rot" `#c0392b`, „XL" – der Hex-Wert hängt am Wert, nicht am Merkmal |
| `product_attribute_links` | Artikel ↔ Wert |

- **Kein Freitextfeld am Artikel.** Nach zwei Wochen stünden „rot", „Rot",
  „ROT" und „rot/orange" nebeneinander und keine Filterleiste ließe sich
  daraus bauen. Aus einer gepflegten Werteliste wird sie von allein.
- **Kein Bestand je Wert.** `products` führt eine Bestandszahl, auf die Kasse,
  Wareneingang und Bestellungen buchen. Ein Merkmal ist eine Angabe, keine
  Lagerposition. Soll der Kunde zwischen rot und blau *wählen*, sind das zwei
  Artikel – gebündelt über eine Artikelgruppe (Migration 033, eigener
  Abschnitt weiter unten). Die Merkmale sind dort die Grundlage: aus den
  Werten der Mitglieder entstehen die Auswahlfelder.
- **Gepflegt** unter `/admin/settings`
  (`components/forms/product-attributes-settings.tsx`): Merkmal anlegen, Werte
  darunter. Farbwerte über den Systemwähler (`<input type="color">`) statt
  einer eigenen Palette – er kennt die Farbe der Ware besser als jede
  Vorauswahl.
- **Angehakt** über `components/admin/merkmal-auswahl.tsx`, überall gleich:
  Artikelformular, Kassen-Anlegedialog, Wareneingang. **Zugeklappt** als
  Vorgabe – die meisten Artikel haben keine Merkmale, und vier aufgeklappte
  Farbreihen schöben Preise und Bestand aus dem Bild. Gesetzte Merkmale zeigt
  der Aufklapper als Zahl; ein zugeklappter Block darf nichts verstecken.
- **RLS**: lesen darf jeder (`anon` eingeschlossen), schreiben nur der Admin.
  Anders als die Artikel-Flags aus Migration 021 sind Merkmale nach außen
  gerichtet – sie stehen auf der Artikelseite und in der Filterspalte, auch
  ohne Konto. Preise, Bestände und Kundendaten hängen an keiner der Tabellen.
- **Im Shop**: `components/merkmal-liste.tsx` auf der Artikelseite (Kreis
  **und** Wort – ein Kreis allein ist für Farbfehlsichtige keine Angabe, das
  Wort allein sagt nichts über den Ton), Kästchen je Wert in der
  Filterspalte. Innerhalb eines Merkmals gilt **ODER** („rot oder blau"),
  zwischen zwei Merkmalen **UND** („rot, und zwar in XL"): zwei Farben
  anzuhaken soll die Liste verlängern, eine Größe dazu sie kürzen. Aufgelöst
  in `getProductIdsByValues()`; `null` heißt „kein Filter gesetzt" und ist
  nicht dasselbe wie eine leere Menge.
- Der Abschnitt „Merkmale" der Filterspalte hieß vorher so und meinte die
  festen Kennzeichen (neu, Topseller, verfügbar) – der heißt jetzt
  **Kennzeichen**.

---

## 🧩 Artikelgruppen (Ausführungen)

`supabase/migrations/033_artikelgruppen.sql`. Eine LED-Lampe in 60 W und
100 W, warmweiß und kaltweiß, sind **vier Artikel** – vier Etiketten, vier
Barcodes, vier Bestände – und **ein Angebot**, in dem der Kunde auswählt.

| Was | Wo |
|-----|-----|
| `product_groups` | gemeinsamer Titel und Beschreibungstext |
| `products.group_id` | Zugehörigkeit, `ON DELETE SET NULL` |
| `create_group_products()` | alle Kombinationen in einer Transaktion |

- **Keine `parent_id` auf products.** Bei einem Kopfartikel wäre eine
  Ausführung privilegiert; wer sie löscht, weil die 60-W-Variante ausläuft,
  ließe die übrigen ohne Titel zurück. Die Gruppe trägt den Namen, die
  Mitglieder sind gleichberechtigt.
- **Eine Ausführung ist ein ganz normaler Artikel.** Kasse, Wareneingang,
  Bestand, Bestellung und Rechnung sehen keinen Unterschied und mussten nicht
  angefasst werden. Genau deshalb diese Lösung und keine Untervarianten-Tabelle.
- **Auflösen der Gruppe löscht nichts**: die Artikel stehen danach wieder
  einzeln im Sortiment. Ein CASCADE hier nähme das Löschen einer Überschrift
  zum Anlass, vier verkäufliche Artikel samt Historie mitzunehmen.
- **Generator** unter `/admin/gruppen/new`
  (`components/admin/gruppen-generator.tsx`): Merkmalswerte ankreuzen – Farbe
  rot und blau, Watt 60 und 100 –, das Kreuzprodukt erscheint als
  **bearbeitbare** Tabelle mit Bezeichnung, Barcode, drei Preisen und Bestand.
  Was es nicht gibt (rot in 100 W), wird gestrichen. Die Vorschau ist
  bearbeitbar, weil ausgerechnet Preis und Bestand das sind, was die
  Ausführungen unterscheidet – sie hinterher einzeln nachzupflegen wäre der
  Aufwand, den der Generator gerade spart.
  Bearbeitete Zeilen hängen an der Wertkombination und nicht an einem
  Listenindex: kreuzt jemand danach eine weitere Farbe an, wird die Vorschau
  neu gerechnet und die getippten Preise finden ihre Zeile wieder.
- **Zweiter Weg**: bestehende Artikel lassen sich im Artikelformular über
  „Gehört zum Angebot" zuordnen und an der Gruppe wieder lösen. Ware, die
  schon im Regal steht, war beim Anlegen noch kein Bündel.
- **Angelegt wird in der Datenbank**, nicht in einer Schleife der Anwendung:
  jede Ausführung braucht eine Nummer aus dem Nummernkreis (`next_sku` sperrt
  die Kategoriezeile), eine Preisstaffel und ihre Merkmalsverknüpfungen. Ein
  Abbruch nach der zweiten Zeile ließe zwei halbe Ausführungen und einen
  weitergezählten Nummernkreis zurück.

### Im Shop

- **Eine Kachel je Angebot**: `gruppiere()` in `lib/product-groups.ts` faltet
  die Liste **nach** Filter und Sortierung. Behalten wird die *erste* – damit
  folgt der Vertreter der gewählten Sortierung (Preis aufsteigend → die
  günstigste) und passt zum Filter (wer „rot" anhakt, sieht die rote). Eine
  eigene Regel („immer die billigste") würde die Sortierung zerreißen.
  Gezählt wird ebenfalls nur, was den Filter überstand.
- **Gezählt werden Angebote, nicht Artikel** – in `getCategoryCounts()` und
  auf der Startseite. Stünde in der Filterspalte „12" und die Liste zeigte
  6 Kacheln, sähe das nach einem Fehler aus.
- **Auswahl auf der Artikelseite**: `components/product-variant-picker.tsx`,
  gespeist von `baueAuswahlfelder()`. **Links, keine Schaltflächen mit
  Zustand**: jede Ausführung hat eine eigene Adresse, also wechselt die Auswahl
  die Seite. Das kostet einen Seitenaufruf und bringt drei Dinge, die eine
  Client-Auswahl nicht hätte – die Adresse lässt sich verschicken, der
  Zurück-Knopf funktioniert, und Preis, Staffeln, Bestand und Fotos kommen
  frisch vom Server statt vorab für alle Ausführungen mitgeladen zu werden.
- **Wohin der Klick führt**: zur Ausführung, die den geklickten Wert trägt und
  in allen anderen Merkmalen so bleibt wie eingestellt. Gibt es die Kombination
  nicht, ersatzweise irgendeine mit dem Wert – ein toter Knopf verschwiege,
  dass es 100 W überhaupt gibt. Nur wenn der Wert im ganzen Bündel fehlt,
  bleibt die Schaltfläche stumm stehen; weggelassen sähe die Auswahl je nach
  Standpunkt anders aus.
- **Überschrift** ist der Gruppenname, die Zeile darunter die gewählte
  Ausführung: die Überschrift muss beim Wechsel stehen bleiben, sonst springt
  sie unter der Auswahl weg, die man gerade bedient.
- **Merkmale, in denen sich nichts unterscheidet**, werden kein Auswahlfeld –
  sind alle vier Lampen E27, ist eine Auswahl mit einer Schaltfläche keine.
  Die Angabe steht dann in der Merkmalsliste darunter.
- **Ohne Foto keine Ausführung**: `has_image` gilt hier wie überall
  (Migration 020). Bei einem Bündel fiele das sonst nicht auf – die Kachel ist
  ja da, nur eine Option fehlt still. `/admin/gruppen` und die Gruppenseite
  weisen deshalb ausdrücklich auf Ausführungen ohne Foto hin.

---

## 🧾 Freie Position an der Kasse

Nicht alles, was über den Tresen geht, ist ein Artikel im Lager: eine
Reparatur, eine Anlieferung, eine Schachtel, die bewusst nie erfasst wurde.
`create_pos_sale()` kann Zeilen ohne `product_id` seit Migration 018 – sie
werden abgerechnet, aber nicht vom Bestand abgezogen. Es fehlte nur der Weg
dorthin: `components/pos/pos-free-line-dialog.tsx`, Knopf neben der
Namenssuche.

- **Getrennt vom Anlegedialog** daneben: dort entsteht ein Artikel, der
  bleibt, hier eine Zeile, die mit dem Bon endet. Beides in einem Dialog mit
  einem Schalter hieße, am Tresen eine Frage zu stellen, die niemand im
  Vorbeigehen richtig beantwortet.
- **Keine Zusammenlegung** gleichlautender Zeilen und keine
  Bestandsprüfung: zwei Reparaturen sind zwei Vorgänge, und eine
  Dienstleistung ist durch nichts im Lager begrenzt.
- Auf dem Bon steht „freie Position · nicht im Bestand" statt einer leeren
  Artikelnummer – sonst sähe die Zeile aus wie ein Artikel, dem die Nummer
  fehlt. Die Datenbank setzt in `pos_sale_items.product_sku` den Strich.

---

## 🕒 Zuletzt benutzte Warengruppe

`getLastUsedCategoryId()` in `lib/queries/products.ts` – die Warengruppe des
zuletzt angelegten Artikels. Vorgabe in **allen** Anlegewegen: Artikelformular,
Kassen-Schnellanlage, Wareneingang.

Vorher stand überall `categories[0]`, also die alphabetisch erste – im Laden
immer „Spielwaren", auch wenn seit einer Stunde Haushaltswaren ausgepackt
werden. Wer eine Lieferung annimmt, bleibt fast immer in derselben Gruppe.

Abgeleitet aus dem Artikelbestand statt aus einer gemerkten Einstellung: so
gilt sie an jedem Gerät und nach jedem Neustart, und es gibt kein zweites Feld,
das mit der Wirklichkeit auseinanderlaufen kann. Im Wareneingang schlägt die
vorige Zeile der laufenden Aufnahme sie noch – innerhalb einer Lieferung ist
die zuletzt getippte Gruppe die bessere Auskunft.

---

## 🌐 Öffentlicher Katalog ohne Sitzung

`lib/supabase/public.ts` – Client mit dem öffentlichen Schlüssel, ohne Cookies
und ohne Token. `getLandingData()` liest damit; `getCategories()` nimmt ihn
optional entgegen.

Der Grund ist keine Optimierung, sondern eine Kopplung, die es nicht geben
darf: die Startseite las den öffentlichen Katalog über den Cookie-Client, also
entschied das Sitzungstoken des Besuchers darüber, ob die *öffentliche* Seite
Warengruppen zeigt. Ein Token, das die Datenbank gerade nicht annimmt
(`JWT issued at future` – Uhrenversatz zwischen Auth und REST auf
Supabase-Seite), machte aus einem Anmeldeproblem eine leere Startseite.

RLS bleibt unverändert: der öffentliche Schlüssel kann nichts, was ein anonymer
Besucher nicht auch könnte. Alles, was von der Anmeldung abhängt – Shop, Konto,
Verwaltung, Kasse –, läuft weiter über `lib/supabase/server.ts`.

---

## ❤️ Merkliste

`lib/merkliste.ts` (Regeln), `lib/use-merkliste.ts` (Client-Store),
`components/merk-button.tsx`, Seite `/merkliste`.

- **Cookie statt localStorage** (`lider_merkliste`, Kennungen mit Punkt
  getrennt, höchstens 100): die Seite rendert der Server, und der liest nur
  Cookies. Nur Kennungen, keine Namen oder Bilder – angezeigt wird der
  aktuelle Katalog, ausgelistete Artikel fallen von selbst heraus.
- **Keine Datenbank**: merken dürfen auch Besucher ohne Konto. Preis dafür:
  die Liste gilt je Gerät.
- **Herz neben dem Link, nicht darin** – ein Knopf in einem `<a>` ist
  ungültiges HTML. Die Kachel ist deshalb ein `@container`-Rahmen, das Herz
  sitzt über `cqw` unten rechts auf dem Foto, dessen Höhe der Kartenbreite
  folgt.
- In der Kopfleiste ab `sm` als Herz mit Zähler, auf dem Handy im Klappmenü.

## 🧭 Schnellleiste und Klappmenü

`components/schnellleiste.tsx` über dem Kopfbereich der Startseite, in der
Navy-Fläche von Kopfleiste und Hero: schlichte Knöpfe mit dünnem Rand, gold
beim Überfahren; Reduziert als einziger rot gefüllt, dann Neuheiten,
Topseller, Warengruppen. Keine Symbole oder Farbpunkte – die erste Fassung
damit war überladen. Seitlich schiebbar statt umbrechend.

Merkliste, FAQ und Kontakt stehen im Klappmenü mit `nurMenue: true`: in der
breiten Leiste ist kein Platz, dort führen Fußzeile und Schnellleiste hin.

# CLAUDE.md – Großhandels-Shop WebApp

## 🎯 Projektübersicht

**Name:** Lider Großhandel Shop  
**Stack:** Next.js 16 + TypeScript + Tailwind CSS v4 + Supabase + Vercel  
**Ziel:** Professioneller B2B Großhandels-Shop mit Admin-Panel und Customer-Portal

---

## ⚠️ KRITISCHE DESIGN-RICHTLINIE

**Die WebApp darf NICHT nach KI aussehen!**

- ❌ KEINE Glasmorphism, Neumorphism, oder trendy AI-Aesthetics
- ❌ KEINE generische Placeholder-Texte ("Willkommen", "Lorem Ipsum")
- ✅ Klassisch-professionelle B2B Ästhetik (wie LinkedIn, Shopify für Business)
- ✅ Klare Typografie, Weißraum, konservative Farben
- ✅ Funktionalität > Dekoration
- ✅ Schnelle Ladezeiten

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
- `/admin/customers` – Kundenliste (Suche, Filter, Kondition, Umsatz)
- `/admin/customers/[id]` – Kundenakte: Stammdaten, Sonderkondition, persönliche Gutscheine, Bestellungen
- `/admin/gutscheine` – Gutscheine / Aktionscodes mit Einlösungen
- `/admin/startseite` – Werbebilder (Slider) ganz oben auf der Startseite
- `/admin/products` – Produktverwaltung
- `/admin/gruppen` – Angebote mit Ausführungen (Farbe, Größe, Wattzahl)
- `/admin/kassenbuch` – Tageskasse von Hand (Bargeld, Karte, Großhandel je Tag), unabhängig von der Kasse (Migration 057)
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

> **Scope (Entscheidung des Betreibers):** Das Kassenportal ist ein
> **Rechnungs- und Scanwerkzeug für den Großhandel** – Artikel scannen,
> Rechnung erzeugen, der Kunde überweist. Es ist **keine Ladenkasse für den
> stationären Verkauf**. Daraus folgt: keine Kassenfunktionen ausbauen
> (TSE/KassenSichV, Bargeldführung, Kartenzahlung, Bon-Features), keine neuen
> Einzelhandels-Wege. Neue Arbeit dort dient Scan und Rechnung. Was im Code
> noch aus der Ladenkassen-Zeit steht (Bon, Z-Abschluss, Bar/Karte,
> Privatkunde), ist in `docs/kasse.md` unter „Altbestand" aufgeführt.

Eigener Bereich neben `/admin`, nicht darin – hier wird gescannt und
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
- **Tests** – `npm test` (Node-Testrunner, keine Zusatzpakete) für alles, was
  Geld, Steuer oder Preise rechnet: `lib/vat.ts`, `lib/pricing.ts`. Wer dort
  etwas ändert, ändert den Test mit. `npm run check:migrations` prüft die
  Nummerierung der Migrationen. Vor dem Commit: `npm test`, `npm run lint`,
  `npm run build`.
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
| `logo_v1.png` | Lockup (Wappen über Schriftzug) – Kopfleiste, Impressum, Fußzeile, Anmeldeseiten, OG-Bild |
| `logo-mark.png` | nur das Wappen, quadratisch – Klappmenü, Wartungsseite, Favicon |
| `logo-print.png` | aus `logo_v1.png` abgeleitet: weißer Grund, RGB ohne Alpha, 600 px – Briefkopf im Rechnungs-PDF |

`app/icon.png` ist das Favicon (Wappen, 256 px). Die Markenfarben in
`app/globals.css` sind aus dem Logo gezogen: Wappenblau `#284078` (`--brand`),
Lorbeergold `#b8721c` (`--gold`), Schriftrot `#a02020` (`--signal`). Gold ist
die Akzentfarbe auf dunklen Flächen, Rot bleibt Signalfarbe.

---

## ✍️ Inline-Bearbeitung im Adminpanel

`components/admin/inline-edit.tsx` verwandelt eine Tabellenzelle beim Anklicken
in ein Eingabefeld; Enter oder Fokusverlust speichert sofort, Escape verwirft.
Die Zelle kennt ihr Ziel nicht – die Server Action kommt als Prop
(`updateProductField`, `updateCategoryField`). Jedes Feld hat dort ein eigenes
Zod-Schema; ein Feldname ohne Schema wird abgewiesen.

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

---

## 📚 Vertiefung in `docs/`

Die Teilsysteme sind ausgelagert. **Vor Änderungen am jeweiligen Bereich die
Datei lesen** – dort steht, warum etwas so gebaut ist und welche Fehler es
schon einmal gab. Die harten Regeln stehen hier, damit sie auch ohne Lesen
gelten.

| Datei | Inhalt |
|-------|--------|
| `docs/kasse.md` | Kasse (Scan + Rechnung), Rechnungs-/Belegvorlage, Lieferschein, Bon, Tagesabschluss, Umsätze, Signale, freie Position |
| `docs/lager.md` | Einkaufspreis, Bestandsführung, Wareneingang, Sammelimport, Barcode-Nachschlag, Schnellfilter, Warengruppen-Vorgabe |
| `docs/preisschilder.md` | Preisschilder fürs Regal, freie Preisschilder, Strichcode |
| `docs/kataloge.md` | Katalog-Generator |
| `docs/shop.md` | Neu/Reduziert, Bestellablauf, Startseite, Slider, FAQ, Impressum, Merkmale, Artikelgruppen, Merkliste, Sonderkonditionen und Gutscheine |
| `docs/todo.md` | Offene Punkte |

### Harte Regeln (gelten überall)

- **Gebucht wird in der Datenbank**, nie im Browser: `create_order`,
  `create_pos_sale`, `record_stock_entries`, `create_group_products`. Der
  Browser rechnet nur für die Anzeige.
- **Steuer rechnet `lib/vat.ts`**, immer auf die Summe, nie je Zeile. Der Satz
  kommt aus `company_settings.pos_vat_rate` und wird an der Bestellung
  festgeschrieben. Nichts davon im Code festverdrahten.
- **Der Einkaufspreis (`product_costs`) wird nie gedruckt oder an Kunden
  geladen** – nicht auf Schild, Bon, Rechnung, Katalog.
- **Kundenrabatt und Gutschein** rechnet `create_order()` (Migration 054,
  Gutschein für Warengruppen 059),
  die Anzeige `lib/rabatt.ts` in derselben Reihenfolge: Warenwert →
  Sonderkondition % → Gutschein auf den Rest. `total_amount` ist der Betrag
  danach. Wer eins ändert, ändert das andere und `tests/rabatt.test.ts` mit.
  An der Kasse und bei „Rechnung aus Katalog" gilt die Kondition ebenso
  (`create_pos_sale`, `create_admin_order`, Migration 056) – an der Kasse
  nur auf Katalogartikel, nicht auf freie Positionen.
- **Reduziert** entscheidet allein `reduzierung()` (`lib/pricing.ts`), nur
  gegen einen gepflegten Ladenpreis.
- **Nummernkreise sind lückenlos** und stehen in der Datenbank
  (Bestellung `LG-JJJJ-00001`, Rechnung `LDxxxxxxx`, Beleg `LBxxxxxxx`,
  Z-Nummer `Z00001`). Vergebene Nummern werden nie umgeschrieben.
- **Leeres Preisfeld heißt „unverändert"**, nicht „0 €".
- **Preisschilder und Kataloge speichern keine Preise** – jede Ausgabe liest
  frisch aus dem Artikelstamm.
- **Preisschild, Katalog, Rechnung: eine Rechenstelle** (`lib/preisschild.ts`,
  `lib/katalog.ts`, `lib/invoice.ts`). Vorschau und Druck rufen dieselbe
  Funktion; keine zweite Rechnung daneben.
- **Zahlenfelder** nur über `NumericInput` / `QuantityInput`.
- **Datenbankänderungen** nur als neue, idempotente Migration mit der
  nächsten freien Nummer; bestehende Migrationen nicht ändern, wenn sie
  schon eingespielt sind. Ablauf und Backups: `docs/betrieb.md`.

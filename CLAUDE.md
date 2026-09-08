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
- **Farbe** kommt aus dem Logo: Wappenblau trägt Tabellenkopf und Endbetrag,
  Gold die Trennlinien. Kein Schmuck ohne Funktion.
- **Umlaute und fremde Schriftzeichen**: `sicher()` entschärft jeden Text vor
  der Ausgabe. Die Standardschriften von pdf-lib sind WinAnsi-kodiert und
  werfen sonst bei „Yılmaz" oder „Şahin" – aus einer Rechnung würde ein 500er.
- **Kontaktdaten** der Fußzeile (`owner_name`, `phone`, `email`, `website`)
  stehen in `company_settings` (Migration 019) und werden unter
  `/admin/settings` gepflegt.

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

## 🔻 Reduzierte Artikel

`products.list_price` (Migration 023) ist der **Vorher-Preis**, nichts weiter:
eine Behauptung über den früheren Preis, deshalb am Artikel und nicht an einer
Staffel. `reduzierung()` in `lib/pricing.ts` entscheidet, ob daraus eine
Anzeige wird – nur wenn der Wert über dem aktuellen Preis liegt und gerundet
mehr als 0 % Ersparnis übrig bleiben. Ein Cent Unterschied ist kein Angebot.

- **Bezugspreis** ist der günstigste erreichbare: in der Karte `range.from`,
  auf der Artikelseite der Preis der eingestellten Menge – die Ersparnis
  wandert mit der Staffel mit.
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
| Kassenverkauf (`create_pos_sale`) | `stock_available` −Menge |
| Wareneingang (`record_stock_entries`) | `stock_available` ±Menge, Journalzeile in `stock_entries` |

Freie Rechnungen (`create_manual_invoice`) rühren den Bestand **nicht** an:
ihre Positionen sind Freitext ohne Artikelbezug. Wer Ware abbuchen will, legt
die Rechnung über „Aus Katalog" an.

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

`components/category-carousel.tsx`, Bilder aus `categories.image_path`
(Migration 031).

- **Bild an der Warengruppe, nicht im Quelltext**: gepflegt wird es unter
  `/admin/categories` (`components/admin/category-image.tsx`). Hochgeladen
  wird direkt aus dem Browser in den Bucket `products` unter
  `kategorien/<id>/…`; die Server Action bekommt nur den Pfad. Eigene
  Storage-Policies braucht das nicht – „admin write" gilt für den ganzen
  Bucket, gelesen wird über Signed URLs.
- **Reihe statt Raster**: native Scroll-Snap-Bahn, die Pfeile schieben nur um
  eine Kachelbreite. Ein Karussell mit eigenem Zustand zeigte ohne JavaScript
  nichts und würgte auf dem Telefon das Wischen ab.
- **Farbbalken unten** trägt die Warengruppenfarbe aus `lib/accent-colors.ts`
  – dieselbe wie in Filterspalte und Kachelliste. Er verbindet die Ansichten,
  er schmückt nicht.
- Ohne Bild bleibt die Kachel eine Kachel (Farbfläche der Gruppe). Ein Loch
  im Raster sähe nach Fehler aus.
- Die Warengruppenspalte neben dem Sortiment-Querschnitt ist dafür entfallen:
  zweimal dieselbe Liste auf einer Seite ist eine zu viel.

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

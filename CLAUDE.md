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
| **File Storage** | Supabase Storage (Bucket `products`) | Bilder getrennt von den Metadaten |
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
- `/admin` – Admin Dashboard (Stats, Übersicht)
- `/admin/customers` – Kundenverwaltung
- `/admin/products` – Produktverwaltung
- `/admin/products/new` – Produkt erstellen
- `/admin/products/[id]/edit` – Produkt bearbeiten
- `/admin/orders` – Bestellverwaltung
- `/admin/categories` – Kategorien verwalten

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
- Customers werden nur vom Admin erstellt (kein Public Sign-Up)
- Bilder werden in Supabase Storage gespeichert (nicht DB)
- Keine Zahlung/Payment in Phase 1 (nur Warenkorb + Bestellung)
- Reports/Export = Phase 2
- Mobile App = Phase 3+

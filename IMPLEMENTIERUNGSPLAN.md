# Implementierungsplan – Lider Großhandels-Shop

**Projektdauer:** ~80-120 Stunden (abhängig von Parallelisierung)  
**Iterationen:** 5 Phasen

---

## 📅 Phase 0: Setup & Boilerplate (2-3 Stunden)

### Ziele:
- Next.js 15 Projekt initialisieren
- Supabase Projekt erstellen & konfigurieren
- Environment Variables setzen
- Basis-Layout & Styling

### Konkrete Tasks:

#### 0.1 Next.js Projekt  ✅ erledigt

Tatsächlich installiert: **Next 16.3.0**, React 19.2.8, **Tailwind v4**.
Das Projekt liegt direkt im Repo-Root (nicht in `lider-shop/`).

```bash
npx create-next-app@latest lider-shop --typescript --tailwind --eslint \
  --app --no-src-dir --import-alias "@/*" --turbopack --use-npm
npm install @supabase/supabase-js @supabase/ssr zod server-only
```

`@supabase/auth-helpers-nextjs` ist deprecated und wird **nicht** verwendet –
Nachfolger ist `@supabase/ssr`.

#### 0.2 Supabase Projekt
- Supabase Account erstellen (free tier)
- Neues Projekt anlegen
- API Keys kopieren (.env.local)
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
  SUPABASE_SERVICE_KEY=xxx (nur für Server-Side)
  ```

#### 0.3 Folder-Struktur
```
app/
├── layout.tsx (root layout)
├── page.tsx (landingpage)
├── login/
│   └── page.tsx
├── shop/
│   ├── page.tsx
│   ├── [category]/
│   │   └── page.tsx
│   └── product/
│       └── [id]/
│           └── page.tsx
├── cart/
│   └── page.tsx
├── checkout/
│   └── page.tsx
├── orders/
│   └── page.tsx
├── account/
│   └── page.tsx
├── admin/
│   ├── layout.tsx (AdminGuard)
│   ├── page.tsx (dashboard)
│   ├── customers/
│   │   └── page.tsx
│   ├── products/
│   │   ├── page.tsx
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [id]/
│   │       └── edit.tsx
│   └── categories/
│       └── page.tsx
├── api/
│   ├── auth/ (Supabase Auth Callbacks)
│   ├── products/
│   ├── customers/
│   ├── orders/
│   └── upload/ (Image Upload)
├── lib/
│   ├── supabase.ts (Client + Server Clients)
│   ├── auth.ts (Auth Helpers)
│   └── types.ts (TypeScript Interfaces)
└── components/
    ├── Header.tsx
    ├── Footer.tsx
    ├── AuthGuard.tsx
    ├── AdminGuard.tsx
    ├── ProductCard.tsx
    ├── ProductGrid.tsx
    ├── PriceTable.tsx
    ├── StockBadge.tsx
    └── forms/
        ├── LoginForm.tsx
        ├── ProductForm.tsx
        ├── CustomerForm.tsx
        └── CategoryForm.tsx
```

#### 0.4 Tailwind + shadcn/ui  ✅ erledigt
```bash
npx shadcn@latest init -t next -b radix --preset nova --css-variables --no-pointer
npx shadcn@latest add input label textarea select card table dialog badge \
  dropdown-menu separator skeleton sonner checkbox alert
```
Installiert: Button, Input, Label, Textarea, Select, Card, Table, Dialog, Badge,
DropdownMenu, Separator, Skeleton, Sonner (Toasts), Checkbox, Alert.
Icons: Lucide.

#### 0.5 Basis-Layout  ✅ erledigt
- `app/layout.tsx` → Root Layout mit `Header`, `Footer`, `Toaster`, `lang="de"`
- Globale Styles + Farb-Palette in `app/globals.css`
- **Kein `tailwind.config.ts`** – Tailwind v4 konfiguriert Farben über den
  `@theme inline`-Block. Tokens: `--primary` #1F2937, `--brand` #2563EB,
  `--success` #059669, `--radius` 0.375rem, System-Font-Stack.

---

## 📊 Phase 1: Database & Auth (4-6 Stunden)

### Ziele:
- Supabase Tabellen erstellen
- Auth System konfigurieren
- TypeScript Types definieren

### Konkrete Tasks:

#### 1.1 Database Schema erstellen (Supabase SQL Editor)

> ⚠️ **Der SQL-Block unten ist überholt.** Auszuführen ist
> `supabase/schema.sql`. Korrigiert wurden dort:
> - **RLS-Rekursion:** die Orders-Policy des Entwurfs liest per Subquery aus
>   `users`, die selbst RLS hat → `infinite recursion detected in policy`.
>   Ersetzt durch `public.is_admin()` als `SECURITY DEFINER`-Funktion.
> - **Fehlende Schreibrechte:** der Entwurf hatte nur SELECT-Policies, der Admin
>   hätte über die App nichts anlegen können. Jetzt `FOR ALL` je Tabelle.
> - **Katalog nicht mehr öffentlich:** Staffelpreise sind Großhandelskonditionen
>   und nur für angemeldete, aktive Kunden lesbar.
> - **Produkte löschbar:** `order_items` referenziert die Variante nullable und
>   speichert Name/SKU/Preis als Snapshot.
> - Ergänzt: `orders.delivery_address`, `products.is_active`, automatische
>   `order_number` (`LG-2026-00001`), `updated_at`-Trigger, Indizes,
>   Storage-Policies, Auto-Profil-Trigger auf `auth.users`.

Ursprünglicher Entwurf (nur noch als Referenz):

```sql
-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Product Variants (Preisgestaffeln)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_quantity INT NOT NULL,
  max_quantity INT,
  unit_price DECIMAL(10, 2) NOT NULL,
  stock_available INT DEFAULT 0,
  stock_reserved INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Product Images
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Users (extended auth.users info)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  company_name TEXT,
  role TEXT DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'confirmed', 'shipped', 'delivered')),
  total_amount DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Order Items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Basics)
-- Public can read categories & products
CREATE POLICY "Categories are public" ON categories FOR SELECT USING (true);
CREATE POLICY "Products are public" ON products FOR SELECT USING (true);
CREATE POLICY "Product variants are public" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Product images are public" ON product_images FOR SELECT USING (true);

-- Users can only read their own data
CREATE POLICY "Users read own data" ON users FOR SELECT 
  USING (auth.uid() = id);

-- Users can read their own orders
CREATE POLICY "Orders readable by owner" ON orders FOR SELECT 
  USING (auth.uid() = customer_id OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin');

-- Admins can do everything (will be checked in application logic)
```

#### 1.2 Supabase Storage für Bilder
- Gehe zu Storage in Supabase Dashboard
- Neuen Bucket erstellen: `products`
- Public machen (Read-Only für Public)

#### 1.3 TypeScript Types definieren (`lib/types.ts`)
```typescript
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  order_index: number;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  min_quantity: number;
  max_quantity?: number;
  unit_price: number;
  stock_available: number;
  stock_reserved: number;
}

export interface ProductImage {
  id: string;
  product_id: string;
  file_path: string;
  display_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
  images?: ProductImage[];
  category?: Category;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  company_name?: string;
  role: 'admin' | 'customer';
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  order_number: string;
  status: 'draft' | 'submitted' | 'confirmed' | 'shipped' | 'delivered';
  total_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_variant_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
```

#### 1.4 Supabase Clients  ✅ erledigt

Statt einer Datei drei getrennte Clients – ein Modul-Level-Client wie ursprünglich
skizziert kann pro Request keine Session tragen und würde in Server Components
Sessions zwischen Nutzern vermischen:

| Datei | Key | Einsatz |
|-------|-----|---------|
| `lib/supabase/client.ts` | anon | Client Components |
| `lib/supabase/server.ts` | anon + Cookies | Server Components, Actions, Route Handler (`await createClient()`) |
| `lib/supabase/admin.ts` | **service** | nur nach `requireAdmin()`; umgeht RLS |

`proxy.ts` im Repo-Root hält die Session frisch und schützt die Routen
`/shop`, `/cart`, `/checkout`, `/orders`, `/account`, `/admin`.

#### 1.5 Auth Helpers (`lib/auth.ts`)
```typescript
import { cookies } from 'next/headers';

export async function getSession() {
  const cookieStore = cookies();
  // Oder verwende Supabase Auth Helpers direkt
}

export async function getCurrentUser() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function checkIsAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  
  const supabase = supabaseServer();
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  
  return data?.role === 'admin';
}
```

---

## 🎨 Phase 2: Landingpage & Authentication (3-4 Stunden)

### Ziele:
- Landingpage mit Hero + About Section
- Login-Seite
- Session Management

### Konkrete Tasks:

#### 2.1 Landingpage (`app/page.tsx`)
```typescript
// Hero Section mit:
// - Logo
// - "Großhandel für Profis" Headline
// - Kurze Beschreibung
// - Login/Shop CTAs

// About Section mit:
// - Wer wir sind (2-3 Sätze)
// - Unsere Werte (3-4 Punkte)
// - Kontakt Info

// Footer mit:
// - Copyright
// - Links (Impressum, Datenschutz)
```

Design-Anforderungen:
- Clean, professionell
- Keine Animations-Schnickschnack
- System-Font (Inter/SF Pro)
- Dunkle Farben (Charcoal #1F2937)
- CTA-Button in Accent-Blue (#2563EB)

#### 2.2 Login-Seite (`app/login/page.tsx`)
- Einfaches Email/Password Form
- Supabase Auth Integration
- Error Handling
- Redirect nach erfolgreichem Login (zu `/shop` oder `/admin`)

#### 2.3 Auth Guard Components
- `AuthGuard.tsx` – Redirect auf `/login` wenn nicht authentifiziert
- `AdminGuard.tsx` – Redirect auf `/shop` wenn nicht Admin

#### 2.4 Header/Navigation
- Logo (Lider)
- Nav-Links (Shop, Admin wenn Admin, Account, Logout)
- Responsive Hamburger Menu (Mobile)

---

## 🛍️ Phase 3: Shop & Product Pages (8-10 Stunden)

### Ziele:
- Shop-Landingpage mit Kategorien & Produktgrid
- Kategorie-Filter
- Produkt-Detailseite
- Warenkorb (Client-Side State mit Context oder Zustand)

### Konkrete Tasks:

#### 3.1 Shop-Landingpage (`app/shop/page.tsx`)
- Kategorien als Tabs/Pills laden
- Produkte als Grid (3 Spalten Desktop, 2 Tablet, 1 Mobile)
- Filter-Sidebar (optional)
- Search/Sort

#### 3.2 ProductCard Component
```typescript
interface ProductCardProps {
  product: Product;
  onClick: () => void;
}

// Zeige:
// - Produkt-Foto (erstes aus product_images)
// - Name
// - SKU
// - Kurze Beschreibung (truncated)
// - Ab-Preis (niedrigster Price Tier)
// - Stock-Badge (verfügbar/ausverkauft)
```

#### 3.3 Produkt-Detailseite (`app/shop/product/[id]/page.tsx`)
- Foto-Carousel (oder Image Gallery)
- Produkt-Info (Name, SKU, Beschreibung)
- PriceTable Component (alle Preisgestaffeln)
- Stock-Status
- "In den Warenkorb" Button
- Menge-Eingabe (mit Validierung gegen Min-Menge)

#### 3.4 PriceTable Component
```typescript
// Tabelle oder Liste:
// Menge (von) | Menge (bis) | Preis/Stück | Rabatt?
// z.B:
// 1-49         | -          | €1,50      | -
// 50-199       | -          | €1,30      | -3%
// 200+         | -          | €1,10      | -27%
```

#### 3.5 StockBadge Component
```typescript
// Grünes Badge: "500 verfügbar"
// Gelbes Badge: "20 verfügbar" (wenn < 50)
// Rotes Badge: "Ausverkauft"
```

#### 3.6 Cart Management (Client-Side Context)
```typescript
// lib/cart-context.tsx
interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
}

// Context mit:
// - addToCart()
// - removeFromCart()
// - updateQuantity()
// - clear()
// - getTotal()
```

#### 3.7 Warenkorb-Seite (`app/cart/page.tsx`)
- Listet alle Artikel auf
- Mengen editierbar
- Preisberechnung
- "Zur Kasse" Button

---

## 📋 Phase 4: Bestellungen & Customer Account (6-8 Stunden)

### Ziele:
- Checkout & Bestellerfassung
- Bestellhistorie
- Account-Seite

### Konkrete Tasks:

#### 4.1 Checkout (`app/checkout/page.tsx`)
- Bestätige Warenkorb-Inhalte
- Liefer-Adresse (optional, direkt in Bestellung speichern)
- Notizen-Feld
- "Bestellung aufgeben" Button
- API Route `/api/orders/create` aufrufen

#### 4.2 Orders API (`app/api/orders/route.ts`)
```typescript
// POST /api/orders
// Body: { items: CartItem[], notes: string, deliveryAddress?: string }
// 
// 1. Authentifizierung checken
// 2. Order in DB erstellen
// 3. OrderItems hinzufügen
// 4. Cart clearen (Frontend)
// 5. Redirect zu Bestellhistorie
```

#### 4.3 Bestellhistorie (`app/orders/page.tsx`)
- Tabelle mit allen Bestellungen (Datum, Nummer, Status, Betrag)
- Sortierung & Filterung
- Detail-View (Modal oder separate Seite)

#### 4.4 Account-Seite (`app/account/page.tsx`)
- Persönliche Daten anzeigen (Name, Email, Firma)
- (Optional) Passwort ändern
- Logout Button

---

## 👨‍💼 Phase 5: Admin Panel (20-25 Stunden)

### Ziele:
- Admin Dashboard
- Produkt-Management (CRUD)
- Kategorie-Management
- Kunden-Management
- Bestellverwaltung

### Konkrete Tasks:

#### 5.1 Admin Layout & Guard (`app/admin/layout.tsx`)
- AdminGuard Component
- Admin-Spezifische Navigation
- Sidebar oder Top-Nav mit Admin-Menu

#### 5.2 Admin Dashboard (`app/admin/page.tsx`)
Statistiken anzeigen:
- Total Kunden (aktiv / inaktiv)
- Total Produkte
- Total Kategorien
- Letzte 10 Bestellungen (Tabelle)
  - Datum, Kunde, Betrag, Status
  - Klickbar zu Detail-View
- Top 5 Artikel (nach Bestellhäufigkeit)
- Lagerbestands-Übersicht (Artikel mit wenig Stock)

#### 5.3 Produkt-Management (`app/admin/products/page.tsx`)
**Liste aller Produkte:**
- Tabelle: SKU, Name, Kategorie, Stock, Erstellt, Aktionen
- Actions: Bearbeiten, Löschen, Duplicate
- Add New Button

#### 5.4 Produkt erstellen/bearbeiten (`app/admin/products/[id]/edit.tsx`)
**ProductForm Component:**
```typescript
interface ProductFormProps {
  product?: Product; // undefined wenn "neu"
  onSuccess?: () => void;
}

// Felder:
// - SKU (Text, required, unique)
// - Name (Text, required)
// - Beschreibung (Textarea)
// - Kategorie (Select from DB)
// - Bilder Upload (Drag-n-Drop, mehrere)
// - Preisgestaffeln (Add/Remove Rows)
//   - Min-Menge
//   - (Optional) Max-Menge
//   - Preis/Stück
// - Stock verfügbar (Number)
// - Save Button
```

**Image Upload:**
- Nutze `app/api/upload` Route
- Speichere in Supabase Storage (`products/` Bucket)
- Rückgabe: URL zum angezeigten Bild
- Lösch-Funktion für Bilder

```typescript
// app/api/upload/route.ts
// POST /api/upload
// FormData mit "file" Field
// Speichere in Supabase Storage
// Gib file_path zurück
```

#### 5.5 Kategorie-Management (`app/admin/categories/page.tsx`)
- Tabelle: Name, Slug, Beschreibung, Order, Aktionen
- Add New, Edit, Delete
- Drag-to-reorder (optional, aber nice)

#### 5.6 Kunden-Management (`app/admin/customers/page.tsx`)
**Liste aller Kunden:**
- Tabelle: Email, Name, Firma, Status (aktiv/inaktiv), Erstellt, Aktionen
- Actions: Bearbeiten, Deaktivieren, Löschen
- Add New Button

**Kunde erstellen/bearbeiten (`CustomerForm`):**
```typescript
// Felder:
// - Email (Text, required, unique)
// - Vollname (Text, required)
// - Firmenname (Text)
// - Status (Aktiv/Inaktiv Checkbox)
// - Save Button

// Wenn neu: Temporary Password generieren + Email versenden
// Oder: Invite-Link per Email
```

**Temp-Password Logik:**
- Generate random 8-10 char Password
- Setze in Supabase Auth
- Versende Email mit Credentials
- Kunde setzt beim ersten Login neues PW

```typescript
// app/api/customers/invite/route.ts
// POST /api/customers/invite
// Body: { email, full_name, company_name }
// 1. User in auth.users erstellen (temp pw)
// 2. User-Record in users Tabelle
// 3. Invitation Email versenden
```

#### 5.7 Bestellverwaltung (`app/admin/orders/page.tsx`)
- Tabelle: Bestellnummer, Kunde, Datum, Betrag, Status, Aktionen
- Filter nach Status
- Detailseite (Modal oder separate Route)
  - Bestellpositionen
  - Kundendaten
  - Status-Änderung (Dropdown)

---

## 🔧 Phase 6: Polish & Deployment (5-8 Stunden)

### Ziele:
- Error Handling
- Loading States
- Performance
- Deployment auf Vercel

### Konkrete Tasks:

#### 6.1 Error Handling & Toast Notifications
- Installiere: `sonner` (Toast Library)
- Error Messages in allen Forms
- API-Response Error Handling
- Fallback UI wenn Daten laden fehlschlagen

#### 6.2 Loading States
- Skeleton Components (shadcn/ui)
- Loading Spinners bei API Calls
- Disabled Buttons während Submission

#### 6.3 Form Validation
- Installiere: `zod` (Validation)
- Schema für jede Form (Product, Customer, Category, Order)
- Client-side + Server-side Validation

#### 6.4 Performance
- Image Optimization (Next.js Image Component)
- Code Splitting (Dynamic Imports für Admin)
- Database Query Optimization (Indexes auf wichtige Felder)

#### 6.5 Vercel Deployment
```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git push origin main

# Vercel Dashboard: Import GitHub Repo
# Environment Variables setzen:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_KEY

# Deploy
```

#### 6.6 Supabase in Production
- Prüfe RLS Policies (keine accidental Data Leaks)
- Backups aktivieren
- API Rate Limiting setzen

---

## 📝 API Routes Übersicht

| Route | Method | Beschreibung |
|-------|--------|-------------|
| `/api/auth/callback` | GET | Supabase Auth Callback |
| `/api/upload` | POST | Image Upload zu Storage |
| `/api/products` | GET, POST | Produkte listeni / erstellen |
| `/api/products/[id]` | GET, PUT, DELETE | Produkt-CRUD |
| `/api/categories` | GET, POST | Kategorien |
| `/api/categories/[id]` | GET, PUT, DELETE | Kategorie-CRUD |
| `/api/customers` | GET, POST | Kunden-Liste / erstellen |
| `/api/customers/[id]` | GET, PUT, DELETE | Kunden-CRUD |
| `/api/customers/invite` | POST | Kunden-Einladung per Email |
| `/api/orders` | GET, POST | Bestellungen listeni / erstellen |
| `/api/orders/[id]` | GET, PUT | Bestellung-Detail / Status ändern |

---

## 🎯 Checkliste pro Phase

### ✅ Phase 0
- [ ] Next.js Projekt
- [ ] Supabase Setup
- [ ] Folder-Struktur
- [ ] Tailwind + shadcn/ui

### ✅ Phase 1
- [ ] Database Schema
- [ ] Storage Bucket
- [ ] TypeScript Types
- [ ] Supabase Clients

### ✅ Phase 2
- [ ] Landingpage
- [ ] Login-Seite
- [ ] Auth Guard Components
- [ ] Header/Navigation

### ✅ Phase 3
- [ ] Shop-Landingpage
- [ ] ProductCard + Grid
- [ ] Produkt-Detailseite
- [ ] PriceTable & StockBadge
- [ ] Cart Context

### ✅ Phase 4
- [ ] Checkout-Seite
- [ ] Orders API
- [ ] Bestellhistorie
- [ ] Account-Seite

### ✅ Phase 5
- [ ] Admin Dashboard
- [ ] Produkt-CRUD
- [ ] Kategorie-CRUD
- [ ] Kunden-CRUD + Invite
- [ ] Bestellverwaltung
- [ ] Image Upload

### ✅ Phase 6
- [ ] Error Handling & Toasts
- [ ] Loading States
- [ ] Form Validation
- [ ] Performance
- [ ] Vercel Deployment

---

## 💬 Prompts für Claude Code (Beispiele)

Du kannst diese Prompts so oder ähnlich in Claude Code verwenden:

**Phase 0:**
> "Initialisiere ein Next.js 15 Projekt mit TypeScript, Tailwind CSS und shadcn/ui. Erstelle die Folder-Struktur wie in IMPLEMENTIERUNGSPLAN.md beschrieben. Nutze `create-next-app` mit den Flags für TypeScript und Tailwind."

**Phase 1:**
> "Erstelle die TypeScript Types (lib/types.ts) und Supabase Clients (lib/supabase.ts) wie in IMPLEMENTIERUNGSPLAN.md Phase 1.3-1.4 beschrieben. Keine Implementierung der Logik, nur Types und Client-Setup."

**Phase 2:**
> "Erstelle die Landingpage (app/page.tsx) mit Hero-Section und About-Seite. Design soll professionell, clean und NICHT nach KI aussehen. Nutze Tailwind mit den Farben #1F2937 (Charcoal) und #2563EB (Blue). Keine Animationen."

**Phase 3:**
> "Erstelle die Shop-Seite (app/shop/page.tsx) und ProductCard Component. Lade Produkte und Kategorien aus Supabase. Grid-Layout: 3 Spalten Desktop, responsive. Nutze shadcn/ui für Buttons und Cards."

... und so weiter.

---

## 🛠️ Tipps für Claude Code Session

1. **Nutze die CLAUDE.md als Referenz** – Claude kann die Datei in jedem Prompt einlesen
2. **Teile große Tasks auf** – Lieber 2-3 separate Prompts als ein 10-Zeiler
3. **Sei konkret** – "Erstelle ProductForm" ist besser als "Mach was im Admin"
4. **Teste während Entwicklung** – `npm run dev` lokal testen
5. **Git Commits machen** – Nach jeder Phase: `git commit -m "Phase X: Feature Y"`

---

## 🎨 Design-Reminders

- **KEIN Neumorphism, Glasmorphism, oder Gradient-Overkill**
- **Klare, lesbare Typografie** – nicht zu viele Schriftgrößen
- **Weißraum is wichtig** – nicht jeder Pixel muss gefüllt sein
- **Konsistente Spacing** – Multiples von 4px (Tailwind Default)
- **Professionelle Farbpalette** – grau, blau, weiß
- **Keine KI-typischen Animationen** – fade-in, slide-in höchstens minimal

---

## 📞 Support-Kontakte

- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs
- Tailwind Docs: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com/

---

**Bereit? Los geht's mit Phase 0! 🚀**

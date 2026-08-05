-- =============================================================================
-- Lider Großhandel – Datenbankschema (Grundgerüst)
--
-- Reihenfolge beim Neuaufsetzen, jeweils im Supabase SQL Editor:
--   1. supabase/schema.sql                              (diese Datei)
--   2. supabase/migrations/001_bestand_auf_produkt.sql
--   3. supabase/migrations/002_bestellung_anlegen.sql
--   4. supabase/migrations/003_erstadmin_ermoeglichen.sql
--   5. supabase/migrations/004_artikelnummern_und_versand.sql
--
-- Alle Skripte sind idempotent und können gefahrlos erneut laufen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabellen
--
-- Muss vor den Hilfsfunktionen stehen: `LANGUAGE SQL`-Funktionen prüfen ihren
-- Rumpf bereits beim Anlegen. Stünde is_admin() weiter oben, bricht das Skript
-- mit `42P01: relation "public.users" does not exist` ab.
-- -----------------------------------------------------------------------------

-- Profildaten zu auth.users. Rolle und Aktiv-Status leben hier.
CREATE TABLE IF NOT EXISTS public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT UNIQUE NOT NULL,
  full_name    TEXT,
  company_name TEXT,
  role         TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT statt CASCADE: eine Kategorie mit Produkten soll nicht versehentlich
  -- den halben Katalog mitreißen. Der Admin muss erst umhängen oder leeren.
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  sku         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  -- Bestand gehört an den Artikel, nicht an die Preisstaffel (siehe
  -- migrations/001_bestand_auf_produkt.sql).
  stock_available INT NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
  stock_reserved  INT NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preisstaffeln. Eine Zeile = ein Mengenbereich mit eigenem Stückpreis.
CREATE TABLE IF NOT EXISTS public.product_variants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity INT NOT NULL CHECK (min_quantity > 0),
  max_quantity INT CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  unit_price   NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, min_quantity)
);

CREATE TABLE IF NOT EXISTS public.product_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_number     TEXT UNIQUE NOT NULL
                     DEFAULT 'LG-' || to_char(now(), 'YYYY') || '-' ||
                             lpad(nextval('public.order_number_seq')::TEXT, 5, '0'),
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','confirmed','shipped','delivered')),
  total_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes            TEXT,
  delivery_address TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- product_variant_id ist NULLABLE mit ON DELETE SET NULL und wird durch
-- Snapshot-Spalten ergänzt. Sonst ließe sich ein einmal bestelltes Produkt nie
-- mehr löschen, und eine spätere Preisänderung würde alte Rechnungen verfälschen.
CREATE TABLE IF NOT EXISTS public.order_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name       TEXT NOT NULL,
  product_sku        TEXT NOT NULL,
  quantity           INT NOT NULL CHECK (quantity > 0),
  unit_price         NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal           NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Hilfsfunktionen
-- -----------------------------------------------------------------------------

-- SECURITY DEFINER ist hier zwingend: die Funktion liest public.users, und
-- public.users hat selbst RLS. Ohne DEFINER würde jede Policy, die is_admin()
-- aufruft, rekursiv wieder RLS auf users auswerten -> "infinite recursion
-- detected in policy". search_path wird fest gesetzt, damit die erhöhten Rechte
-- nicht über untergeschobene Schemas ausgenutzt werden können.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND is_active
  );
$$;

-- Angemeldet UND nicht deaktiviert. Deaktivierte Kunden behalten ihre
-- Bestellhistorie in der DB, kommen aber an keine Daten mehr heran.
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Indizes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_category    ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active      ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock       ON public.products(stock_available);
CREATE INDEX IF NOT EXISTS idx_variants_product     ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_images_product       ON public.product_images(product_id, display_order);
CREATE INDEX IF NOT EXISTS idx_orders_customer      ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_categories_order     ON public.categories(order_index);

-- -----------------------------------------------------------------------------
-- 4. Trigger
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Legt automatisch ein Profil an, sobald ein Konto in auth.users entsteht
-- (egal ob per Admin-Invite oder manuell im Supabase Dashboard).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, company_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'company_name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_created ON auth.users;
CREATE TRIGGER trg_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
--
-- Grundsatz: der Katalog ist NICHT öffentlich. Großhandelspreise sollen nur
-- angemeldete, aktive Gewerbekunden sehen. Anonyme Besucher bekommen ausschließ-
-- lich die Landingpage. Schreibrechte hat nur die Rolle 'admin'.
-- -----------------------------------------------------------------------------

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items      ENABLE ROW LEVEL SECURITY;

-- users -----------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_self  ON public.users;
DROP POLICY IF EXISTS users_update_self  ON public.users;
DROP POLICY IF EXISTS users_admin_all    ON public.users;

CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Kunde darf Name/Firma pflegen, aber nicht Rolle oder Aktiv-Status.
-- Das erzwingt der Trigger unten, weil RLS keine Spaltenprüfung kann.
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Kein angemeldeter Nutzer = direkter Datenbankzugriff (SQL Editor,
  -- Service-Key). Nötig, damit sich der erste Admin überhaupt anlegen lässt.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Rolle und Status dürfen nur von Admins geändert werden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_privileges ON public.users;
CREATE TRIGGER trg_protect_user_privileges
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileges();

-- Katalog ---------------------------------------------------------------------
DROP POLICY IF EXISTS categories_read       ON public.categories;
DROP POLICY IF EXISTS categories_admin_all  ON public.categories;
CREATE POLICY categories_read ON public.categories
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY categories_admin_all ON public.categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS products_read      ON public.products;
DROP POLICY IF EXISTS products_admin_all ON public.products;
CREATE POLICY products_read ON public.products
  FOR SELECT TO authenticated
  USING (public.is_active_user() AND (is_active OR public.is_admin()));
CREATE POLICY products_admin_all ON public.products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS variants_read      ON public.product_variants;
DROP POLICY IF EXISTS variants_admin_all ON public.product_variants;
CREATE POLICY variants_read ON public.product_variants
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY variants_admin_all ON public.product_variants
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS images_read      ON public.product_images;
DROP POLICY IF EXISTS images_admin_all ON public.product_images;
CREATE POLICY images_read ON public.product_images
  FOR SELECT TO authenticated USING (public.is_active_user());
CREATE POLICY images_admin_all ON public.product_images
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Bestellungen ----------------------------------------------------------------
DROP POLICY IF EXISTS orders_select_own   ON public.orders;
DROP POLICY IF EXISTS orders_insert_own   ON public.orders;
DROP POLICY IF EXISTS orders_admin_all    ON public.orders;
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() AND public.is_active_user());
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND public.is_active_user());
CREATE POLICY orders_admin_all ON public.orders
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS order_items_select_own ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_own ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_all  ON public.order_items;
CREATE POLICY order_items_select_own ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
  ) AND public.is_active_user());
CREATE POLICY order_items_insert_own ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
  ) AND public.is_active_user());
CREATE POLICY order_items_admin_all ON public.order_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Storage: Bucket `products` (PRIVAT)
--
-- Der Bucket wird von diesem Skript angelegt, im Dashboard ist nichts zu tun.
-- `public = false`: Produktfotos sind nicht per direkter URL abrufbar. Die App
-- erzeugt serverseitig kurzlebige Signed URLs (siehe lib/storage.ts).
-- Lesen dürfen nur angemeldete, aktive Kunden – genau wie beim Katalog.
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'products', 'products', false,
  5242880,  -- 5 MB pro Datei
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "product images public read"  ON storage.objects;
DROP POLICY IF EXISTS "product images read"         ON storage.objects;
DROP POLICY IF EXISTS "product images admin write"  ON storage.objects;

CREATE POLICY "product images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'products' AND public.is_active_user());

CREATE POLICY "product images admin write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'products' AND public.is_admin())
  WITH CHECK (bucket_id = 'products' AND public.is_admin());

-- =============================================================================
-- 7. Admin-Konto freischalten
-- Nach dem Anlegen des eigenen Kontos (Supabase -> Authentication -> Add user)
-- einmalig ausführen, E-Mail anpassen:
--
--   UPDATE public.users SET role = 'admin' WHERE email = 'DEINE@MAIL.DE';
-- =============================================================================

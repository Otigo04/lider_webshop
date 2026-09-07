-- =============================================================================
-- Migration 027 – Härtung: Bildzugriff und Registrierung
--
-- Zwei Befunde aus dem zweiten Sicherheitsdurchgang:
--
-- 1. Die Policy "product images read public" (Migration 006/011/012) erlaubte
--    anonymen Besuchern SELECT auf den GESAMTEN Bucket `products`:
--
--      USING (bucket_id = 'products')
--
--    Damit ließ sich zu jedem bekannten Pfad eine Signed URL erzeugen – auch
--    zu Fotos deaktivierter oder nie freigeschalteter Artikel. Ausnutzbar nur
--    mit Kenntnis des Pfades (Artikel-UUID plus Datei-UUID), also kein
--    dringender Fall, aber deutlich weiter als beabsichtigt. Der Kommentar in
--    lib/storage.ts behauptete zudem eine Prüfung, die für `anon` gar nicht
--    stattfand.
--
--    Die Pfade haben die Form <artikel-uuid>/<datei-uuid>.<ext>
--    (components/forms/product-form.tsx). Der erste Abschnitt reicht deshalb,
--    um dieselbe Prüfung anzuwenden, die product_images schon verwendet.
--
-- 2. Die Selbstregistrierung (/register) hatte außer dem Lockvogelfeld keine
--    Bremse. Ein Skript konnte beliebig viele sofort aktive Konten anlegen –
--    und jedes aktive Konto sieht Staffelpreise und Bestände. Dieselbe Bremse
--    wie beim Anfrageformular (Migration 014), nur an der Stelle, an der die
--    Anwendung sie abfragen kann.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bildzugriff auf öffentliche Artikel begrenzen
-- -----------------------------------------------------------------------------

-- Die Prüfung steckt in einer eigenen Funktion und nicht als AND-Kette in der
-- Policy: Postgres garantiert bei AND keine Auswertungsreihenfolge. Stünde
-- Formprüfung und Cast nebeneinander, könnte der Planer den Cast zuerst
-- ausführen – ein Pfad ohne UUID-Ordner (Altbestand, Fehlupload) ließe dann
-- die ganze Abfrage mit einem Fehler abbrechen, statt nur eine Zeile
-- unsichtbar zu machen.
CREATE OR REPLACE FUNCTION public.bildpfad_ist_oeffentlich(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ordner TEXT := (storage.foldername(p_name))[1];
BEGIN
  IF v_ordner IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Pfadform: <artikel-uuid>/<datei-uuid>.<ext>,
  -- siehe components/forms/product-form.tsx
  IF v_ordner !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;

  RETURN public.product_is_public(v_ordner::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bildpfad_ist_oeffentlich(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "product images read public" ON storage.objects;
CREATE POLICY "product images read public" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'products'
    AND public.bildpfad_ist_oeffentlich(name)
  );

-- -----------------------------------------------------------------------------
-- 2. Bremse für die Selbstregistrierung
--
--    Als Funktion statt als Trigger auf public.users: das Profil entsteht über
--    handle_new_user() und damit im selben Vorgang wie ein vom Admin angelegter
--    Kunde. Ein Trigger träfe beide gleichermaßen und ließe sich nicht
--    unterscheiden, weil bei beiden Wegen auth.uid() leer ist. Die Anwendung
--    ruft diese Funktion deshalb genau an der einen Stelle auf, an der sie
--    gelten soll (lib/actions/auth.ts, signUp).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.signup_zulaessig()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- 20 neue Konten je Stunde sind für einen Großhandel reichlich; ein Skript
  -- läuft dagegen sofort auf.
  SELECT COUNT(*) < 20
  FROM public.users
  WHERE created_at > now() - INTERVAL '1 hour'
    AND role = 'customer';
$$;

GRANT EXECUTE ON FUNCTION public.signup_zulaessig() TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

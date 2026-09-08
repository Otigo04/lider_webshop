-- Kategoriebilder
--
-- Die Startseite zeigt die Warengruppen als Kacheln mit Foto. Das Bild gehört
-- an die Warengruppe und nicht in den Quelltext: der Betrieb tauscht es aus,
-- wenn sich das Sortiment ändert, und dafür soll kein Deploy nötig sein.
--
-- Gespeichert wird nur der Storage-Pfad, wie bei den Produktfotos. Der Bucket
-- `products` ist privat; die Anzeige läuft über Signed URLs (lib/storage.ts).
-- Eigene Storage-Policies braucht es nicht: „product images admin write"
-- erlaubt Admins den ganzen Bucket, „product images read public" das Lesen.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_path TEXT;

COMMENT ON COLUMN public.categories.image_path IS
  'Storage-Pfad des Kachelbilds im Bucket products, z. B. kategorien/<id>/<uuid>.jpg';

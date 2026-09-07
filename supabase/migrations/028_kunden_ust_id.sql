-- =============================================================================
-- Migration 028 – USt-IdNr. des Kunden
--
-- company_settings.vat_id ist die EIGENE Umsatzsteuer-Identifikationsnummer
-- (Migration 016). Die des Kunden wurde nirgends erfasst – damit ließ sich
-- keine Rechnung an einen Abnehmer im EU-Ausland korrekt ausstellen: bei
-- innergemeinschaftlicher Lieferung muss die USt-IdNr. des Empfängers auf der
-- Rechnung stehen (§ 14a UStG).
--
-- Bewusst ein freies Textfeld ohne Formatprüfung: die Formate der 27
-- Mitgliedstaaten unterscheiden sich, und eine zu strenge Prüfung würde eher
-- gültige Nummern abweisen als falsche verhindern. Wer die Nummer wirklich
-- prüfen will, tut das über das Bestätigungsverfahren des BZSt – nicht über
-- eine Regex im Formular.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS vat_id TEXT;

COMMENT ON COLUMN public.users.vat_id IS
  'USt-IdNr. des Kunden, für Rechnungen an EU-Abnehmer. Frei erfasst, nicht geprüft.';

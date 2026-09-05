-- =============================================================================
-- Migration 017 – Rechnungsnummern vereinfachen
--
-- Bisher: LG-R-2026-00001 (Präfix, Gattung, Jahr, laufende Nummer). Am Telefon
-- vorzulesen und auf einem Überweisungsträger unterzubringen ist das zu viel.
--
-- Ab jetzt: LI + siebenstellige laufende Nummer, also LI0000001.
--
-- Wichtig: bereits vergebene Nummern werden NICHT umgeschrieben. Eine einmal
-- gestellte Rechnung behält ihre Nummer – alles andere wäre in der
-- Buchhaltung ein Bruch der fortlaufenden Nummerierung. Der Wechsel gilt nur
-- für neu entstehende Rechnungen.
--
-- Die Sequenz läuft weiter, wo sie steht; die alten und die neuen Nummern
-- können sich dadurch nicht überschneiden.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.invoices
  ALTER COLUMN invoice_number
  SET DEFAULT 'LI' || lpad(nextval('public.invoice_number_seq')::TEXT, 7, '0');

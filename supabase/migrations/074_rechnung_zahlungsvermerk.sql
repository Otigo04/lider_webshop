-- =============================================================================
-- Migration 074 – Zahlungsvermerk auf der Rechnung
--
-- invoices.payment_note nimmt den Text auf, der auf der Rechnung anstelle des
-- Zahlungsziels steht ("Betrag bar bezahlt", "Per Überweisung bezahlt", freier
-- Text). NULL heißt: Standard, also Zahlungsziel aus den Firmendaten bzw. der
-- Vermerk, der sich aus der Zahlart der Bestellung ergibt. Der Text wird beim
-- Anlegen festgeschrieben und bei Nachdruck und Storno unverändert benutzt.
--
-- Im Supabase SQL Editor ausführen. Idempotent.
-- =============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

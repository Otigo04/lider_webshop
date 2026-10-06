# Betrieb: Migrationen und Backups

Die Datenbank liegt bei Supabase, die Migrationen werden **von Hand** im SQL
Editor eingespielt. Das ist in Ordnung, solange jeder Schritt gleich abläuft.

## Eine Migration einspielen

1. `npm run check:migrations` – Nummer frei, keine Lücke, keine Doppelung.
2. **Backup vor dem Einspielen** (siehe unten) – bei jeder Migration, die
   Daten umschreibt, Spalten löscht oder Constraints verschärft.
3. Datei im SQL Editor ausführen. Alle Migrationen sind idempotent
   (`IF NOT EXISTS`, `CREATE OR REPLACE`); ein zweiter Lauf schadet nicht.
4. Kurz prüfen: die betroffene Seite öffnen (bei Kasse/Bestellung: eine
   Testbuchung), und den SQL Editor auf Fehlermeldungen ansehen.
5. In `docs/todo.md` abhaken, **welche Migration bis wann eingespielt ist**.
   Der Stand der Produktivdatenbank steht nirgends sonst – wer ihn nicht
   notiert, weiß ihn später nicht.

### Regeln

- Neue Nummer = höchste vorhandene + 1. Eingespielte Migrationen werden nicht
  mehr geändert; eine Korrektur ist eine neue Migration.
- Zwei Dateien mit Nummer 037 gibt es bereits (beide eingespielt). Sie werden
  nicht umbenannt; `scripts/migrations-check.mjs` kennt die Ausnahme.
- Nummernkreise (Bestellung, Rechnung, Beleg, Z-Nummer) nie zurücksetzen.
  `tests/nummernkreise.test.ts` schlägt bei `RESTART` oder `setval(…, 1)` an.

## Backups

Das ist eine **Prüfliste, kein Ist-Zustand** – ich konnte vom Repository aus
nicht sehen, was im Supabase-Projekt eingestellt ist. Abhaken, wenn
kontrolliert:

- [ ] Supabase Dashboard → Database → Backups: welcher Tarif, gibt es tägliche
      Sicherungen, wie viele Tage werden gehalten? (Der kostenlose Tarif hat
      keine verlässlichen Sicherungen; ab dem Pro-Tarif gibt es tägliche, und
      Point-in-Time-Recovery ist ein Zusatz. Aktuellen Stand im Dashboard
      nachlesen, nicht hier.)
- [ ] **Eigene Kopie außerhalb von Supabase**, mindestens wöchentlich:
      `pg_dump` mit der Verbindungszeichenfolge aus Project Settings →
      Database, auf einen Rechner oder Speicher, der nicht derselbe Anbieter ist.
      Rechnungen sind Buchhaltungsunterlagen – sie müssen auch dann
      vorhanden sein, wenn das Projekt gesperrt oder gelöscht wird.
- [ ] **Storage mitsichern**: Bucket `invoices` (gespeicherte Rechnungs-PDFs)
      und `products` (Fotos). Ein Datenbank-Dump enthält die Dateien nicht.
- [ ] **Einmal die Wiederherstellung üben**: Dump in ein leeres
      Testprojekt einspielen und eine Rechnung öffnen. Ein Backup, das nie
      zurückgespielt wurde, ist eine Vermutung.
- [ ] Wer ist zuständig, und wann wird kontrolliert? Eintrag im Kalender.

### Aufbewahrung

Rechnungen und Buchungsbelege unterliegen gesetzlichen Aufbewahrungsfristen
(derzeit 8 Jahre für Buchungsbelege, 6 für Handelsbriefe – Stand beim
Steuerberater erfragen, die Fristen ändern sich). Die Datenbank löscht
Rechnungen nie von selbst; `reset_pos_day_closings()` ist eine
Einrichtungsfunktion und gehört nicht in den Produktivbetrieb.

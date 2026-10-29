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

## Admin-Benachrichtigungen (Web-Push)

**Einmalig einrichten**

1. Migration `082_push_subscriptions.sql` einspielen (mit Backup, siehe oben).
2. Schlüsselpaar erzeugen, im Projektordner und nach `npm install`:
   `node -e 'console.log(require("web-push").generateVAPIDKeys())'`.
   `publicKey` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `privateKey` → `VAPID_PRIVATE_KEY`.
3. In Vercel (Production **und** Preview) eintragen: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (= `https://www.lider-berlin.de`). Danach neu
   deployen, weil der öffentliche Schlüssel beim Build in den Browsercode eingeht.
   Lokal stehen sie in `.env.local`. Das Paar nicht tauschen, solange Geräte
   angemeldet sind – alte Abos funktionieren mit einem neuen Paar nicht mehr.

**Gerät anmelden**

- *iPhone (iOS 16.4+):* in Safari die Shop-Adresse öffnen, anmelden, „Teilen →
  Zum Home-Bildschirm“, die App „LIDER Admin“ **vom Home-Bildschirm** öffnen,
  `/account` → Benachrichtigungen → „aktivieren“, Erlaubnis bestätigen. Dann
  „Test senden“.
- *Mac:* in Safari oder Chrome `/account` öffnen, aktivieren, Erlaubnis
  bestätigen, „Test senden“. In den Systemeinstellungen unter „Mitteilungen“
  muss der Browser Mitteilungen anzeigen dürfen und der Fokus darf sie nicht
  stummschalten.

**Wenn etwas ausbleibt**

- Reiter „Bestellungen“ in der Verwaltung zeigt die Zahl der noch nicht
  bearbeiteten Bestellungen (Status „Eingegangen“) – auch ohne Push.
- `/account` → Benachrichtigungen: „Zuletzt erreicht“ je Gerät; „Test senden“
  meldet, ob das Gerät noch erreichbar ist (sonst wird es entfernt, dann neu
  aktivieren).
- Vercel-Logs nach `[push]` durchsuchen. `VAPID-Schlüssel fehlen` heißt:
  Variablen nicht gesetzt oder nicht neu deployt.
- iPhone: Fokus-/Nicht-stören-Modus, ausgeschaltete Mitteilungen für die App in
  den iPhone-Einstellungen, oder die App wurde vom Home-Bildschirm gelöscht.
- Das Web-App-Manifest (`app/manifest.ts`) gilt für die ganze Seite: legt ein
  Kunde den Shop auf den Home-Bildschirm, heißt die App ebenfalls „LIDER
  Admin“ und startet in `/admin` (Kunden werden von dort in den Shop
  umgeleitet). Unschädlich, aber gut zu wissen.
- Abmelden hebt die Benachrichtigungen nicht auf. Auf einem Gerät, das auch
  andere benutzen (z. B. der Laden-Mac), vor der Weitergabe unter `/account` das
  Gerät „Entfernen“, sonst erscheinen Mitteilungen mit Kundennamen und Beträgen
  weiter.
- Wechselt das Schlüsselpaar, erkennt die App ein altes Abo am Gerät und meldet
  es beim nächsten Besuch der Verwaltung neu an; Mitteilungen kommen dann erst
  wieder, wenn das Gerät einmal die Verwaltung geöffnet hat.

# Bestellablauf-Erweiterung: Steuernummer, Öffnungszeiten, Zahlart, Suche

Datum: 2026-10-15

## Ziel

Vier Lücken im Bestellablauf des Shops schließen:

1. Bestellung nur mit hinterlegter Steuernummer / USt-IdNr.
2. Öffnungszeiten pflegen, anzeigen und für den Abholtermin erzwingen.
3. Zahlart wählbar (Vorkasse oder auf Rechnung); Erstbesteller zahlen vorab,
   Ware geht erst nach Zahlungseingang raus.
4. Allgemeine Suche in Kopfleiste und auf der Startseite.

Die vier Teile sind unabhängig und können einzeln umgesetzt und ausgeliefert
werden. Reihenfolge der Umsetzung: 4, 2, 1, 3 (aufsteigend nach Risiko).

## 1. Steuernummer als Pflichtangabe

### Verhalten

- `users.vat_id` (Migration 028) bleibt die einzige Spalte. Sie nimmt eine
  EU-USt-IdNr. **oder** eine deutsche Steuernummer auf. Label überall:
  „USt-IdNr. / Steuernummer".
- Ohne gültige Angabe ist keine Bestellung möglich: Checkout sperrt den
  Bestellknopf und verweist auf `/account`; `createOrder` und `create_order()`
  lehnen ab.
- Keine Online-Abfrage (VIES/BZSt). Nur Formatprüfung.

### Umsetzung

- `lib/profil.ts`: `vat_id` kommt in `PFLICHT`, Bezeichnung
  „USt-IdNr. / Steuernummer". `ProfilFelder` bekommt `vat_id`. Damit nutzen
  Kundenakte, Checkout und Bestell-Action dieselbe Lückenprüfung.
- Neu `lib/steuernummer.ts` (rein, ohne Server-Importe):
  `pruefeSteuernummer(wert): { ok: true; art: "ustid" | "steuernr" } | { ok: false; grund: string }`.
  - Leerzeichen und Bindestriche werden vor der Prüfung entfernt.
  - USt-IdNr. Deutschland: `DE` + 9 Ziffern.
  - USt-IdNr. andere EU-Länder: zwei Buchstaben + 2–12 alphanumerische Zeichen.
  - Deutsche Steuernummer: 10–13 Ziffern, Schrägstriche erlaubt.
- Formulare mit `vat_id` (`account-forms.tsx`, `profile-complete-form.tsx`,
  `customer-form.tsx`) und die Actions `account.ts`, `admin-customers.ts`
  rufen `pruefeSteuernummer` und zeigen den Grund als Fehlertext.
- Checkout: `app/checkout/page.tsx` lädt `vat_id` mit; fehlt sie oder ist sie
  ungültig, erscheint ein Hinweiskasten mit Link zu `/account`, der
  Bestellknopf ist deaktiviert.
- Migration 073: `create_order()` prüft `users.vat_id` nicht leer und wirft
  `Bitte hinterlegen Sie Ihre USt-IdNr. oder Steuernummer im Konto.`

### Risiko

Bestandskunden ohne Nummer sind beim nächsten Checkout gesperrt, bis sie
nachtragen. Der Admin kann die Nummer in der Kundenakte für Telefonkunden
selbst setzen.

## 2. Öffnungszeiten

### Datenmodell

Migration 071:

```sql
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT
  '[{"open":"11:00","close":"18:30"},null,{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"18:30"},{"open":"11:00","close":"18:30"},
    {"open":"11:00","close":"19:00"},{"open":"11:00","close":"19:00"}]'::jsonb;
```

Migrationsnummern des Gesamtvorhabens: 071 Öffnungszeiten, 072 Zahlart,
073 Steuernummer. Falls bis zur Umsetzung eine Nummer vergeben wurde, rückt
die Reihe auf die nächsten freien (`npm run check:migrations`).

Format: Array mit sieben Einträgen, Index 0 = Montag … 6 = Sonntag, je
`{"open":"11:00","close":"18:30"}` oder `null` (geschlossen). Vorbelegung:

| Tag | Zeit |
|-----|------|
| Montag | 11:00–18:30 |
| Dienstag | geschlossen |
| Mittwoch–Freitag | 11:00–18:30 |
| Samstag, Sonntag | 11:00–19:00 |

Die Migration ändert nur, wenn die Spalte noch nicht existiert (idempotent).

### Logik

Neu `lib/oeffnungszeiten.ts` (rein, getestet):

- `parseOeffnungszeiten(json)` mit Rückfall auf die Vorbelegung bei kaputtem
  Wert.
- `istGeoeffnet(date, zeiten)` in Zeitzone Europe/Berlin.
- `naechsteOeffnung(date, zeiten)`.
- `formatOeffnungszeiten(zeiten)` → zusammengefasste Zeilen
  („Mo, Mi–Fr 11:00–18:30 Uhr", „Di geschlossen", „Sa, So 11:00–19:00 Uhr").

### Pflege

`/admin/settings/oeffnungszeiten`, eigener Menüpunkt im Einstellungsmenü
links. Je Wochentag zwei Zeitfelder und eine Checkbox „geschlossen". Server
Action mit Zod-Schema: `open < close`, Format `HH:MM`.

### Anzeige

- `/kontakt`, Fußzeile, FAQ-Eintrag zur Abholung, Kachel „Selbstabholung"
  im Checkout.
- `components/structured-data.tsx`: `openingHoursSpecification`. Der Kommentar
  dort („Öffnungszeiten stehen bewusst nicht drin, solange …") wird
  angepasst.

### Abholtermin

- Checkout: Terminfeld erlaubt nur Zeitpunkte innerhalb der Öffnung; ein
  Termin außerhalb zeigt den Grund und die nächste mögliche Zeit.
- Migration 071 (gleiche Datei): `create_order()` prüft `p_pickup_at`
  zusätzlich gegen `opening_hours` in Europe/Berlin und wirft
  `Abholung nur zu unseren Öffnungszeiten möglich.` Aufbauend auf dem
  Mindestvorlauf aus Migration 037; dieser bleibt unverändert.

## 3. Zahlart und Erstbestellung

### Datenmodell

Migration 072:

- `orders.payment_method` Constraint erweitert um `prepayment`:
  `IN ('transfer','cash','card','prepayment')`. Bestehendes Constraint
  `orders_payment_method_check` wird ersetzt, das Constraint
  „außer transfer nur pickup" aus 029 wird auf `prepayment` ausgeweitet
  (`prepayment` und `transfer` sind auch bei Versand erlaubt).
- `orders.paid_at TIMESTAMPTZ` (NULL = nicht bezahlt).
- Funktion `public.darf_auf_rechnung(p_user UUID) RETURNS BOOLEAN`:
  wahr, sobald für den Kunden mindestens eine Bestellung mit
  `paid_at IS NOT NULL` existiert. `SECURITY DEFINER`, nur eigene ID oder
  Admin.
- Benennung im UI: `transfer` = „Auf Rechnung", `prepayment` = „Vorkasse –
  sofort überweisen", `cash` = „Bar bei Abholung", `card` = „Karte bei
  Abholung". Der Datenbankwert `transfer` bleibt, damit bestehende
  Bestellungen und Rechnungen unverändert sind.

### Regeln in `create_order()`

- `transfer` nur, wenn `darf_auf_rechnung(auth.uid())`. Sonst Fehler
  `Auf Rechnung ist erst nach einer bezahlten Bestellung möglich.`
- `cash` und `card` weiter nur bei Abholung.
- `prepayment` immer erlaubt.
- Standardwert bei fehlender Angabe bleibt kompatibel: Erstbesteller ohne
  Angabe bekommen `prepayment`, berechtigte `transfer`.

### Sperre

Trigger auf `orders` (`BEFORE UPDATE OF status`): Wechsel auf `ready`,
`shipped` oder `delivered` wird abgelehnt, wenn `payment_method =
'prepayment'` und `paid_at IS NULL`. Fehlertext:
`Zahlung ausstehend – Ware erst nach Zahlungseingang freigeben.`

### Admin

- `/admin/orders/[id]`: Knopf „Zahlung eingegangen" (Server Action, nur
  Admin) setzt `paid_at = now()`. Badge „Zahlung ausstehend" bei offenen
  Vorkasse-Bestellungen, auch in der Bestellliste.
- Barzahlung: Der Admin setzt `paid_at` bei Übergabe über denselben Knopf.

### Checkout

- Kacheln je nach Lieferart:
  - Versand: Vorkasse, Auf Rechnung.
  - Abholung: Bar, Karte, Vorkasse, Auf Rechnung.
- „Auf Rechnung" ist für Erstbesteller ausgegraut mit Text „Erst nach Ihrer
  ersten bezahlten Bestellung verfügbar."
- `app/checkout/page.tsx` lädt `darf_auf_rechnung` und reicht ein Boolean an
  das Formular. Das Formular rechnet nichts, es zeigt nur an.

### Kunde und Dokumente

- Bestellbestätigung und `/orders/[id]`: bei `prepayment` Bankverbindung
  (IBAN aus `company_settings`) und Bestellnummer als Verwendungszweck,
  Hinweis „Ware wird nach Zahlungseingang versendet bzw. bereitgestellt."
- Rechnungs-PDF und Mail: Zahlungszeile je Zahlart (`prepayment`:
  „Bereits per Vorkasse beglichen" bzw. „Zahlbar vor Lieferung").

## 4. Allgemeine Suche

- Neu `components/site-search.tsx` (Client Component, Formular mit GET):
  - In `components/header.tsx`: auf Desktop als Suchfeld bzw. Lupe, auf dem
    Handy im Klappmenü (`mobile-nav.tsx`).
  - Auf der Startseite (`app/page.tsx`): großes Feld oberhalb der
    Kategorien.
- Ziel `/shop?q=<Begriff>`. `app/shop/page.tsx` unterstützt die Suche bereits
  über `loadShopPage` und `sucheWortweise`; es wird geprüft, dass `q` auch im
  Besucher-Schaufenster (ohne Login, ohne Preise) wirkt, und ergänzt, falls
  nicht.
- Suchfelder: Name, Artikelnummer (SKU), Barcode, wie bei der übrigen
  wortweisen Suche (`lib/search.ts`).
- Kein Autocomplete in der ersten Fassung (YAGNI).

## Tests

- `tests/steuernummer.test.ts`: gültige und ungültige USt-IdNr. und
  Steuernummern, Leerzeichen, Kleinschreibung, leerer Wert.
- `tests/oeffnungszeiten.test.ts`: `istGeoeffnet` an Grenzzeiten (11:00,
  18:30, 19:00), Dienstag, Umstellung Sommer/Winterzeit,
  `formatOeffnungszeiten`, kaputtes JSON.
- Zahlartlogik: reine Hilfsfunktion `erlaubteZahlarten(lieferart,
  darfRechnung)` in `lib/zahlart.ts`, getestet.
- Vor jedem Commit: `npm test`, `npm run lint`, `npm run build`,
  `npm run check:migrations`.

## Dokumentation

- `docs/shop.md`: Abschnitte Öffnungszeiten, Zahlart/Erstbestellung,
  Suche.
- `CLAUDE.md`: Route `/admin/settings/oeffnungszeiten`, neue Hartregel
  „Rechnungskauf erst nach bezahlter Bestellung, entscheidet
  `darf_auf_rechnung()`".

## Nicht im Umfang

- Keine Online-Prüfung der USt-IdNr. (VIES/BZSt).
- Keine Feiertags- oder Urlaubsregeln für die Öffnungszeiten.
- Kein Zahlungsanbieter, kein automatischer Zahlungsabgleich mit dem
  Bankkonto.
- Kein Autocomplete in der Suche.
- Keine Änderung am Kassenportal (Scope laut `CLAUDE.md`).

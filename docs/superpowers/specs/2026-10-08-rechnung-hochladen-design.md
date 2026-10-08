# Rechnung hochladen und in den Bestand aufnehmen

Stand: 2026-10-08. Gehört zu `docs/lager.md` (Wareneingang).

## Ziel

Auf `/admin/bestand` lässt sich die PDF-Rechnung eines Lieferanten hochladen.
Die Positionen werden eingelesen, geprüft und nach Bestätigung korrekt in den
Bestand gebucht – neue Artikel angelegt, bekannte aufgestockt. Bisher geschah
das über ein Skript je Lieferung (`scripts/lieferung-*.mjs`).

## Entscheidungen

| Frage | Entscheidung |
|-------|--------------|
| Ablauf | Vorschau, dann Bestätigung durch den Admin. Kein Direktbuchen. |
| Auslesen | KI liest das PDF (AI SDK über das Vercel AI Gateway, wie `lib/actions/product-ai.ts`). Kein fester Parser je Lieferant. |
| Preise neuer Artikel mit UVP | Laden = UVP, Großhandel = UVP ÷ (1 + MwSt), Einkauf = Listenpreis × (1 − Rabatt). |
| Preise neuer Artikel ohne UVP | Großhandel = EK × 1,30, aufgerundet auf 10 Cent. Laden = EK × 2, aufgerundet auf X,99 €. |
| Bekannte Artikel | Nur Bestand und Einkaufspreis. Großhandels- und Ladenpreis bleiben (leeres Feld heißt „unverändert"). |
| Buchungsweg | `record_stock_entries()`, kein zweiter Weg. |
| Migration | Keine. |
| PDF speichern | Nein. |

## Ablauf

1. Knopf „Rechnung hochladen" neben „Liste einfügen" in
   `components/admin/wareneingang.tsx`. PDF bis 4 MB (Vercel-Grenze für
   Anfragen).
2. Route Handler `app/admin/bestand/rechnung/route.ts` (POST, `requireAdmin()`):
   prüft Dateityp und Größe, ruft das Modell mit dem PDF als Dateiteil auf und
   liefert die gelesene Rechnung als JSON. Es wird nichts gebucht.
3. Die Oberfläche gleicht die Codes in **einer** Abfrage ab
   (`findProductsByCodes()` / `lookupPosProducts()`, Barcode vor Artikelnummer)
   und rechnet Prüfung und Preise mit `lib/rechnung-import.ts`.
4. Vorschau-Tabelle: je Zeile „Zugang · Bestand x → y" oder „wird angelegt",
   Menge, EK, GH, Laden, Warengruppe (nur Neuanlage). Alles änderbar. Zahlenfelder
   über `NumericInput`.
5. „Buchen" ruft `record_stock_entries()` mit Notiz
   `<Lieferant>, Rechnung <Nr> vom <Datum>`.

## Gelesene Rechnung (Schema)

Kopf: Lieferant, Rechnungsnummer, Datum, Netto gesamt laut Rechnung,
Nebenkosten netto (Servicegebühr, Versand – keine Artikel).

Position: EAN (leer erlaubt), Lieferantenartikelnummer, Bezeichnung, Menge,
Listenpreis netto, Rabatt in Prozent, UVP brutto (leer erlaubt),
Zeilenbetrag netto laut Rechnung.

Die KI rechnet nichts: sie liest ab. Preise, Summen und Prüfungen entstehen
in `lib/rechnung-import.ts`.

## Sicherungen

- **Gegenprobe je Zeile:** Menge × Listenpreis × (1 − Rabatt) = Zeilenbetrag,
  Toleranz 6 Cent. Abweichung: Zeile rot.
- **Gegenprobe Summe:** Summe der Zeilenbeträge = Netto laut Rechnung minus
  Nebenkosten (Toleranz 6 Cent). Abweichung: Hinweis über der Tabelle.
- **Sperre:** Bei roter Zeile oder Summenabweichung bleibt „Buchen" gesperrt,
  bis jede rote Zeile korrigiert oder ausdrücklich bestätigt ist.
- **Doppelt-Schutz:** Kommt die Rechnungsnummer schon in einer
  `stock_entries.note` vor, zeigt die Vorschau „bereits gebucht" und sperrt
  das Buchen. Aufhebbar nur durch bewusstes Bestätigen.
- **Gleicher Code zweimal** in der Rechnung: eine Zeile, Mengen summiert (wie
  im Sammelimport, `fasseZusammen()`). Zeilen ohne Code bleiben getrennt.
- **Preise 0 oder fehlend:** neue Artikel ohne Ladenpreis sind in der
  Vorschau markiert; Großhandel Pflicht (wie im Wareneingang).
- **Fehler:** Fehlt der API-Key, läuft die Anfrage in eine Zeitüberschreitung
  oder ist das PDF nicht lesbar, steht eine verständliche Meldung da. Der
  übrige Wareneingang bleibt benutzbar.

## Bausteine

- `lib/rechnung-import.ts` – reine Funktionen: Schema (zod), Gegenproben,
  Preisregeln (`preiseNeuerArtikel()`), Zusammenlegen. MwSt-Satz kommt als
  Parameter aus `company_settings.pos_vat_rate`, nichts festverdrahtet.
- `tests/rechnung-import.test.ts` – `npm test`: Gegenproben, Rundung auf 10 Cent
  und X,99, UVP-Regel, Zusammenlegen, Toleranzen. Beispiele aus den Rechnungen
  26080071391 und 26040197140.
- `app/admin/bestand/rechnung/route.ts` – Upload und KI-Aufruf.
- `components/admin/wareneingang-rechnung.tsx` – Dialog und Vorschau.
- Doppelt-Schutz: kleine Abfrage in `lib/queries/stock.ts`.

## Regeln aus CLAUDE.md, die hier gelten

- Gebucht wird in der Datenbank (`record_stock_entries`), der Browser rechnet
  nur für die Anzeige.
- Der Einkaufspreis wird nie gedruckt oder an Kunden geladen; die Seite ist
  Admin-only.
- Leeres Preisfeld heißt „unverändert", nicht „0 €".
- Keine Rechnungs-PDFs oder Lieferantendaten im Repo.

## Prüfung

- `npm test`, `npm run lint`, `npm run build`.
- Manuell mit beiden Iden-Rechnungen: 26040197140 (3 neue Artikel) und
  26080071391 (17 bekannte Artikel). Letztere muss als „bereits gebucht"
  gesperrt sein.

## Nicht Teil dieser Arbeit

Speichern der PDFs, Lieferantenstamm, Einkaufsbuchhaltung, Auftragsbestätigungen
ohne Preise, Fotos der Artikel (das macht der Barcode-Nachschlag nach dem
Buchen weiter).

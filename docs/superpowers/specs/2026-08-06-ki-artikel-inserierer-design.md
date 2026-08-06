# Design: KI-Artikel-Inserierer

Datum: 2026-08-06

## Kontext

Admin lädt beim Anlegen eines neuen Artikels ein Foto hoch. Statt Name,
Beschreibung, Kategorie und Preis von Hand einzutragen, schlägt Claude
Haiku (Vision) das automatisch vor – Admin muss nur noch prüfen und auf
„Artikel speichern" klicken. Preisstaffeln/Bestand bleiben sonst wie
gehabt editierbar, die KI liefert nur einen Startwert für die erste
Preisstaffel.

**Nutzer-Entscheidung (bewusst mit Risiko):** Die KI schätzt auch einen
Preis. Sie kennt Einkaufspreis und Marge nicht – die Schätzung ist ein
grober Anhaltspunkt, kein verlässlicher Wert. Deshalb bleibt sie immer
nur ein editierbares Startfeld, nie automatisch übernommen ohne Sicht des
Admins, und wird im UI als Schätzung markiert.

## 1. Technik: Vercel AI Gateway

- Paket `ai@^6` (bereits installiert), kein zusätzliches Provider-Paket
  nötig – Modellstring `"anthropic/claude-haiku-4.5"` läuft automatisch
  über den Gateway.
- Strukturierte Ausgabe über `generateText({ output: Output.object({...}) })`
  (in `ai@6` heißt das nicht mehr `generateObject`, siehe
  `node_modules/ai/docs/03-ai-sdk-core/10-generating-structured-data.mdx`).
- Bild wird als Bild-URL im Message-Content übergeben (die bereits
  vorhandene Supabase Signed URL nach dem Upload) – kein eigener
  Fetch/Base64-Schritt nötig.
- **Auth-Setup nötig, sonst schlägt jeder Aufruf fehl:** `AI_GATEWAY_API_KEY`
  in `.env.local` setzen (Vercel Dashboard → Projekt → AI Gateway → API
  Keys). Alternative: `vercel link` + AI Gateway im Dashboard aktivieren +
  `vercel env pull` für einen OIDC-Token – aber dafür ist die Vercel CLI
  nötig, die hier laut Systemstatus nicht installiert ist. Der
  API-Key-Weg ist ohne CLI machbar.
- Kosten: läuft über das gemeinsame Vercel-AI-Gateway-Guthaben
  (5 $ kostenlos/Monat je Team, danach Pay-as-you-go). Haiku ist das
  günstigste Claude-Modell, ein Bild-Analyse-Call kostet Bruchteile eines
  Cents.

## 2. Server Action

Neue Datei `lib/actions/product-ai.ts`, `analyzeProductPhoto(imageUrl:
string)`:

- `requireAdmin()` zuerst – Kostenverursachender Call, nur für Admins.
- Lädt bestehende Kategorien (`getCategories()`), baut daraus die Liste,
  aus der die KI wählen muss.
- Zod-Schema: `name` (string), `description` (string), `category_id`
  (string – wird **serverseitig gegen die echte Kategorieliste geprüft**;
  passt die von der KI gelieferte ID zu keiner echten Kategorie, wird sie
  auf `null` gesetzt statt eine falsche Kategorie zu übernehmen),
  `estimated_unit_price` (number).
- Bei jedem Fehler (Netzwerk, Rate-Limit, fehlender API-Key) wird kein
  Fehler geworfen, der das Formular blockiert – die Funktion gibt
  `{ error: "..." }` zurück, das Formular bleibt vollständig manuell
  nutzbar.

## 3. Formular-Verhalten

`components/forms/product-form.tsx`:

- Auslöser: Sobald der **erste** Foto-Upload für einen **neuen** Artikel
  abgeschlossen ist (nicht beim Bearbeiten bestehender Artikel – die
  haben schon Daten).
- Während der Analyse: kleiner Hinweis „KI analysiert Foto …" neben dem
  Foto-Bereich.
- Ergebnis füllt automatisch, aber **nur leere Felder** (falls der Admin
  vor Ende des Uploads schon selbst etwas eingetragen hat, wird das nicht
  überschrieben):
  - Bezeichnung
  - Beschreibung
  - Kategorie (nur wenn die zurückgegebene ID zu einer echten Kategorie
    passt)
  - Preis der ersten Preisstaffel, mit Hinweistext „Von KI geschätzt –
    bitte prüfen" direkt darunter
- Alle Felder bleiben normale, editierbare Inputs – kein Sonderzustand,
  kein Bestätigen/Ablehnen nötig, Admin überschreibt einfach wie jedes
  andere Feld.
- Schlägt die Analyse fehl (Error zurück): stiller Hinweis-Toast „KI-
  Vorschlag nicht verfügbar", Formular bleibt normal nutzbar.

Dafür werden `name`, `description` und `category_id` im Formular von
unkontrollierten Inputs (aktuell `defaultValue` + Auslesen über
`formData.get`) zu kontrollierten Inputs (`useState`) umgebaut – nötig,
um sie programmatisch vorzubefüllen.

## Nicht im Scope

- Kein Streaming/Live-Vorschau während die KI noch tippt – ein
  Analyse-Call, dann fertiges Ergebnis.
- Kein Editieren/Neu-Anfragen der KI-Vorschläge über einen eigenen
  Button – Admin editiert einfach die normalen Felder.
- Keine Analyse beim Bearbeiten bestehender Artikel oder bei weiteren
  Fotos nach dem ersten.
- Kein Preisstaffel-Vorschlag (mehrere Mengenstufen) – nur ein
  Startpreis für die erste, ohnehin schon vorhandene Staffel.

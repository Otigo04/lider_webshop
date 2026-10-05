# Kataloggenerator

**Datum:** 2026-10-05
**Stand:** Entwurf zur Durchsicht

Ein neuer Reiter „Kataloge" in der Verwaltung. Dort werden Artikel zu einem
Katalog zusammengestellt – vom Gesamtkatalog bis zum Aktionsheft „LIDER
aktuell" – und als A4-Dokument ausgegeben, das am Bildschirm gelesen, als PDF
verschickt und im Büro gedruckt werden kann.

Der Katalog geht an Händler. Er muss aussehen wie die Preisliste eines
Großhandels, nicht wie eine Vorlage aus einem Baukasten: die Design-Richtlinie
aus CLAUDE.md gilt hier schärfer als irgendwo sonst, weil das Papier das Haus
verlässt.

---

## Entscheidungen aus der Abstimmung

| Frage | Entscheidung |
|-------|--------------|
| Medium | Ein Dokument für Bildschirm und Bürodrucker, A4 hoch. Keine Druckereivorgaben (Beschnitt, Seitenzahl durch vier). |
| Auswahl | Frei zusammenstellen: einzelne Artikel und ganze Warengruppen. |
| Preise | Je Katalog umschaltbar: Großhandel (netto, Staffeln), Ladenpreis (brutto), ohne Preise. |
| Angaben je Artikel | Foto, Bezeichnung, Artikelnummer, Preis; zuschaltbar Strichcode, Kennzeichen und Reduzierung, Merkmale und Ausführungen, Beschreibung. |
| Raster | Je Katalog umschaltbar: Liste, Kacheln 3×4, Groß 2×3. |
| Rahmenseiten | Titelseite, Inhaltsverzeichnis, Warengruppe auf neuer Seite, Rückseite – jede einzeln abschaltbar. |
| Speichern | Zusammenstellung und Einstellungen in der Datenbank. Kein Archiv fertiger PDFs. |
| Sonderfälle | Ohne Foto: fehlt im Katalog, Werkbank warnt. Ohne Preis der gewählten Preisart: fehlt, Werkbank warnt. Ausverkauft: bleibt drin, Werkbank weist hin. Ausgeblendete Artikel sind wählbar. |
| Anmutung | Je Katalog umschaltbar: sachlich oder Prospekt. |
| Bauweise | HTML aus einem Route Handler plus Druckdialog, wie der Preisschild-Bogen. |

---

## Bauweise: HTML und Druckdialog

Der Katalog entsteht wie der Preisschild-Bogen: ein Route Handler liefert
fertiges A4-HTML, der Browser druckt es oder sichert es als PDF.

Verworfen wurden zwei Wege:

- **pdf-lib wie die Rechnung.** Jedes Element müsste von Hand positioniert und
  jeder Zeilenumbruch selbst gerechnet werden; die Standardschriften sind
  WinAnsi-Helvetica, und WebP-Fotos lassen sich nicht einbetten. Drei Raster
  mal zwei Stile wären sechs handgesetzte Layouts.
- **Headless Chromium auf dem Server.** Brächte einen echten Download-Knopf,
  aber auch eine schwere Abhängigkeit und ein Betriebsteil, das still
  ausfallen kann. Der HTML-Bogen ist dieselbe Vorstufe – wer den Download
  später will, setzt darauf auf, ohne etwas wegzuwerfen.

Preis der Entscheidung: das PDF ist ein Klick mehr („Als PDF sichern" im
Druckdialog), es gibt keinen Knopf, der eine fertige Datei herunterlädt.

---

## Routen

| Route | Art | Zweck |
|-------|-----|-------|
| `/admin/kataloge` | Seite | Liste der gespeicherten Kataloge |
| `/admin/kataloge/[id]` | Seite | Werkbank |
| `/admin/kataloge/[id]/druck` | Route Handler (GET) | der Katalog als A4-HTML |

Der Bogen ist ein Route Handler und keine Seite – aus demselben Grund wie
Kassenbon und Preisschild-Bogen: als Seite läge er unter dem
Verwaltungslayout und brächte Reiterleiste und Rahmen aufs Papier.

**GET, nicht POST** wie beim Preisschild: dort reist die ganze Schilderliste
im Formular mit, hier steht sie in der Datenbank, und die Adresse trägt nur
die Kennung. `?druck=0` unterdrückt den Druckdialog (Vorschau), wie beim
Kassenbon.

Der Reiter „Kataloge" kommt in `app/admin/layout.tsx` hinter
„Preisschilder", mit eigenem Symbol in `components/admin/admin-tabs.tsx`.

---

## Daten

### Migration 051

```sql
CREATE TABLE catalogs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  subtitle           TEXT,
  layout             TEXT NOT NULL DEFAULT 'kacheln'
                     CHECK (layout IN ('liste', 'kacheln', 'gross')),
  stil               TEXT NOT NULL DEFAULT 'sachlich'
                     CHECK (stil IN ('sachlich', 'prospekt')),
  preisart           TEXT NOT NULL DEFAULT 'grosshandel'
                     CHECK (preisart IN ('grosshandel', 'laden', 'ohne')),
  zeige_barcode      BOOLEAN NOT NULL DEFAULT true,
  zeige_beschreibung BOOLEAN NOT NULL DEFAULT false,
  zeige_merkmale     BOOLEAN NOT NULL DEFAULT true,
  zeige_kennzeichen  BOOLEAN NOT NULL DEFAULT true,
  mit_titelseite     BOOLEAN NOT NULL DEFAULT true,
  mit_inhalt         BOOLEAN NOT NULL DEFAULT true,
  mit_trennseiten    BOOLEAN NOT NULL DEFAULT true,
  mit_rueckseite     BOOLEAN NOT NULL DEFAULT true,
  rueckseite_text    TEXT,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog_items (
  catalog_id UUID NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (catalog_id, product_id)
);
```

- **RLS** auf beiden Tabellen: lesen und schreiben nur `is_admin()`. Ein
  Katalogentwurf ist Betriebsinterna, bis er gedruckt ist.
- **Gespeichert wird nur Auswahl und Einstellung**, nie Preis, Bezeichnung
  oder Foto. Jede Ausgabe liest frisch aus dem Artikelstamm – dieselbe Regel
  wie beim Preisschild: eine abgelegte Kopie wäre eine zweite Wahrheit, die
  still veraltet.
- **`ON DELETE CASCADE` am Artikel**: ein gelöschter Artikel fällt aus jedem
  Katalog heraus. Eine Zeile ohne Artikel wäre nicht druckbar.
- **Zusammengesetzter Primärschlüssel**: ein Artikel steht je Katalog einmal.
  Ein zweites Hinzufügen ist kein Fehler, sondern wirkungslos.
- **`mit_trennseiten`** heißt: jede Warengruppe beginnt auf einer neuen Seite.
  Ein eigenes Trennblatt gibt es nicht – das wäre je Gruppe ein Blatt Papier
  ohne Ware.

### Reihenfolge

Warengruppen in der Reihenfolge von `categories.order_index`, darin die
Artikel nach `catalog_items.position`. Der Abschnitt eines Katalogs ist immer
die Warengruppe des Artikels; frei benannte Abschnitte gibt es nicht.

### Ganze Warengruppe

„Ganze Warengruppe hinzufügen" schreibt alle ihre Artikel als einzelne Zeilen
in `catalog_items`. Eine gespeicherte Verknüpfung „Katalog enthält Gruppe X"
gibt es nicht: der Katalog soll nicht ungefragt wachsen, wenn am Tag vor dem
Druck jemand drei Artikel anlegt. „Gruppe auffüllen" holt die Fehlenden
ausdrücklich nach.

### Ausführungs-Angebote

Stehen mehrere Mitglieder derselben Artikelgruppe (`products.group_id`) im
Katalog, falten sie zu **einem** Eintrag: Gruppentitel, ein Foto, darunter
eine Tabelle der Ausführungen (Merkmalswerte · Artikelnummer · Preis).
Gefaltet wird nur, was im Katalog steht – wer aus vier Ausführungen zwei
auswählt, bekommt einen Eintrag mit zwei Zeilen. Ein einzelnes Mitglied steht
als gewöhnlicher Artikel da.

Das Foto ist das des ersten Mitglieds mit Foto. Hat keines eines, fehlt der
ganze Eintrag (siehe Ausschlüsse).

---

## Dateien

Nach dem Muster des Preisschild-Generators:

| Datei | Inhalt |
|-------|--------|
| `supabase/migrations/051_kataloge.sql` | Tabellen und RLS |
| `lib/katalog.ts` | Typen, Maße, Preisregeln, Ausschlüsse, Faltung, Umbruch. Rein – kein Server, kein DOM. |
| `lib/katalog-bogen.ts` | `buildKatalogHtml()`: das A4-Dokument |
| `lib/queries/kataloge.ts` | Liste, einzelner Katalog samt Artikeln und Signed URLs |
| `lib/actions/kataloge.ts` | Anlegen, duplizieren, löschen, Feld ändern, Artikel hinzufügen/entfernen/verschieben |
| `app/admin/kataloge/page.tsx` | Liste |
| `app/admin/kataloge/[id]/page.tsx` | Werkbank (lädt Daten, reicht an Client) |
| `app/admin/kataloge/[id]/druck/route.ts` | Bogen |
| `components/admin/katalog-liste.tsx` | Tabelle der Kataloge |
| `components/admin/katalog-werkbank.tsx` | Rahmen der drei Spalten, hält den Zustand |
| `components/admin/katalog-artikel-suche.tsx` | linke Spalte |
| `components/admin/katalog-zusammenstellung.tsx` | mittlere Spalte samt Warnleiste |
| `components/admin/katalog-einstellungen.tsx` | rechte Spalte |

`lib/katalog.ts` ist die eine Stelle, an der entschieden wird, was gedruckt
wird und auf welcher Seite. Werkbank und Bogen rufen beide dieselben
Funktionen – zwei Rechenwege wären eine Seitenzahl in der Werkbank, die nicht
zum Papier passt.

---

## Der Bogen

### Blatt

A4 hoch, `@page { size: A4; margin: 0 }`, Seitenrand 12 mm im Dokument selbst
– so nah kommt jeder Bürodrucker an die Kante. `print-color-adjust: exact`,
sonst druckt Chrome farbige Flächen weiß.

Jede Artikelseite trägt:

- **Kopfzeile**: Warengruppe links, Schriftzug LIDER rechts.
- **Fußzeile**: Katalogtitel · „Stand TT.MM.JJJJ" · Preishinweis · Seite x.
  Der Stand ist das Datum der Ausgabe: ein Katalog ohne Datum lässt sich
  nicht von seinem Nachfolger unterscheiden.

Das Logo wird als Data-URI eingebettet (`lib/logo.ts`), wie im Kassenbon.

### Seitenfolge

Titelseite → Inhaltsverzeichnis → Artikelseiten → Rückseite.

- **Titelseite**: Logo, Titel, Untertitel.
- **Inhaltsverzeichnis**: Warengruppen mit Seitenzahl. Entfällt von selbst,
  wenn der Katalog weniger als acht Seiten hat – für vier Seiten ein
  Verzeichnis zu drucken wäre eine Seite Papier für drei Zeilen.
- **Rückseite**: Firmenname, Anschrift, Telefon, E-Mail, Webseite aus
  `company_settings`; Bestellwege (Kundenportal, Telefon); Preishinweis;
  darunter der freie Text `rueckseite_text`. Leere Angaben fallen weg.

### Raster

Feste Zellhöhen je Raster. Text wird geklemmt und sprengt nie die Zelle: nur
so bleibt der Umbruch rechenbar, und nur dann stimmen die Seitenzahlen im
Inhaltsverzeichnis.

| Raster | je Seite | Bezeichnung | Beschreibung | Preise bei Großhandel |
|--------|----------|-------------|--------------|----------------------|
| Liste | rund 20 Zeilen | 2 Zeilen | 1 Zeile | bis zu drei Staffelspalten |
| Kacheln | 3 × 4 = 12 | 2 Zeilen | 2 Zeilen | erster Staffelpreis groß, weitere als Nebenzeile („ab 50: 1,30") |
| Groß | 2 × 3 = 6 | 2 Zeilen | 4 Zeilen | volle Staffeltabelle |

Die genaue Zeilenzahl der Liste ergibt sich aus Nutzhöhe und Zeilenhöhe und
steht als Konstante in `lib/katalog.ts`.

Hat ein Artikel mehr als drei Staffeln, zeigt die Liste die ersten zwei und
die letzte – die kleinste Menge, die nächste und den besten Preis.

### Ausführungs-Angebote im Raster

Ein gefaltetes Angebot geht über die volle Seitenbreite: Foto links, Tabelle
rechts. Seine Höhe wird in ganzen Rasterzeilen gerechnet; reicht eine Zeile
für die Ausführungen nicht, nimmt es zwei oder mehr. In der Liste ist es eine
Kopfzeile mit einer Unterzeile je Ausführung.

Passt ein Angebot nicht mehr auf die laufende Seite, wandert es als Ganzes
auf die nächste. Ist es höher als eine ganze Seite, wird es zwischen zwei
Ausführungen geteilt und der Gruppentitel auf der Folgeseite wiederholt.

### Umbruch

`seitenAufteilen()` in `lib/katalog.ts` nimmt die druckbaren Einträge und die
Einstellungen und liefert die Seiten: je Seite Warengruppe und Einträge mit
ihrer Position im Raster. Gerechnet wird in Rasterzeilen. Eine neue
Warengruppe beginnt bei `mit_trennseiten` auf einer neuen Seite; sonst läuft
sie nach einer Zwischenüberschrift weiter, die eine Rasterzeile kostet – und
nie als letzte Zeile einer Seite stehen bleibt.

### Preisregeln

`katalogPreis()` in `lib/katalog.ts`, je Preisart:

- **Großhandel**: Staffeln aus `product_variants`, netto. Preishinweis
  „Alle Preise netto zzgl. gesetzl. USt."
- **Laden**: `products.retail_price`. Preishinweis „Alle Preise inkl. USt."
  **Kein Rückfall auf die Staffel** – anders als an der Kasse. Ein
  Großhandelspreis unter der Überschrift „inkl. USt." wäre ein falscher
  Preis auf Papier, das sich nicht zurückholen lässt.
- **Ohne**: keine Preise, keine Reduzierung, kein Preishinweis.

Ob `retail_price` brutto oder netto gepflegt ist, sagt
`company_settings.pos_prices_gross`; der Preishinweis folgt dieser
Einstellung und ist nicht fest verdrahtet.

**Reduzierung** ausschließlich über `reduzierung()` aus `lib/pricing.ts`,
mit denselben Regeln wie im Shop: ohne gepflegten Ladenpreis keine
Reduzierung, bei Großhandel wird der Prozentsatz auf den Staffelpreis
übertragen.

**Der Einkaufspreis erscheint nie** – die Abfrage lädt `product_costs` gar
nicht erst.

### Ausschlüsse

`druckbar()` in `lib/katalog.ts` entscheidet je Artikel und nennt den Grund:

| Fall | Im Katalog | Werkbank |
|------|-----------|----------|
| kein Foto | fehlt | Warnung |
| Preisart Großhandel, keine Staffel | fehlt | Warnung |
| Preisart Laden, kein Ladenpreis | fehlt | Warnung |
| Bestand 0 | bleibt | Hinweis |
| im Shop ausgeblendet (`is_active = false`) | bleibt | Hinweis |

Der Bestand steht nicht im Katalog: er gilt Wochen, der Lagerstand Stunden.

### Angaben je Artikel

- **Foto**: das erste Bild des Artikels, freigestellt auf Weiß
  (`object-fit: contain`), rechtwinklig.
- **Bezeichnung** und **Artikelnummer** immer.
- **Strichcode** (`zeige_barcode`): über `barcode()` aus `lib/barcode.ts`,
  nur gültige EAN-13, EAN-8, UPC-A. Was kein gültiger Code ist, wird
  weggelassen, nicht berichtigt. Immer schwarz auf Weiß, in beiden Stilen.
  In der Liste entfällt er, wenn die Zeile ihn nicht in lesbarer Modulbreite
  trägt (`MODUL_MIN`).
- **Kennzeichen** (`zeige_kennzeichen`): „Neu" nach der Regel aus
  `lib/product-flags.ts`, „Topseller", dazu die Reduzierung mit Streichpreis
  und Prozent.
- **Merkmale** (`zeige_merkmale`): als Textzeile „Farbe: Rot · Größe: XL".
  Farbwerte mit Wort, ohne Farbkreis – auf einem Schwarzweißdrucker wäre der
  Kreis grau.
- **Beschreibung** (`zeige_beschreibung`): aus `products.description`,
  auf die Zeilenzahl des Rasters geklemmt.

Jeder Text läuft vor der Ausgabe durch HTML-Escaping. Bezeichnungen kommen
aus Lieferantenlisten und enthalten `&`, `<` und Anführungszeichen.

### Zwei Stile

Maße, Raster und Umbruch sind in beiden Stilen gleich. Es wechseln nur Farbe
und Gewicht – ein Katalog, der beim Umschalten des Stils eine andere
Seitenzahl bekäme, wäre nicht mehr dasselbe Dokument.

**Sachlich**
- Weiße Seiten, schwarze Schrift, Haarlinien.
- Wappenblau (`--brand`) in Kopfzeile und Titel, Gold (`--gold`) als
  Trennlinie, Rot (`--signal`) nur für den reduzierten Preis.
- Reduzierung: neuer Preis rot, alter durchgestrichen, Prozent als Text.
- Titelseite: Logo, Titel, Goldstrich, Untertitel, unten die Anschriftzeile.

**Prospekt**
- Kopfband in der Warengruppenfarbe aus `lib/accent-colors.ts`.
- Preis groß mit hochgestelltem Cent (`preisTeile()` aus
  `lib/preisschild.ts`).
- Reduzierung: rotes Feld mit weißem Prozentsatz; Kennzeichen als gefüllte
  Felder.
- Titelseite: Navy-Fläche, Logo, Titel in Gold, bis zu vier Fotos aus dem
  Katalog – reduzierte Artikel zuerst, sonst die ersten der Zusammenstellung.

### Gestaltungsregeln für beide Stile

Diese Regeln sind der Teil, an dem sich entscheidet, ob der Katalog wie eine
Preisliste aussieht oder wie eine Vorlage:

- Keine Verläufe, keine Schatten, keine abgerundeten Karten.
- Keine Symbole und keine Emoji.
- Preise rechtsbündig, Tabellenziffern (`font-variant-numeric: tabular-nums`).
- Eine Schriftfamilie (`SCHRIFT` aus `lib/preisschild.ts`), zwei Gewichte,
  vier Größen. Maße in Millimetern und Punkt, keine Tailwind-Klassen.
- Linien 0,25 pt. Abstände aus einem 2-mm-Raster.
- Jede Zelle ist gleich aufgebaut: Foto, Bezeichnung, Nummer, Preis an
  derselben Stelle. Leere Angaben lassen ihren Platz frei, statt den Rest
  nachrücken zu lassen – sonst stehen die Preise einer Zeile auf
  verschiedenen Höhen.
- Die letzte Seite einer Warengruppe bleibt angebrochen; leere Zellen sind
  weißes Papier.

### Fotos und Druckdialog

Die Fotos kommen als Signed URLs (`getImageUrls()`). Der Druckdialog öffnet
erst, wenn alle Bilder geladen oder gescheitert sind – ein nachgeladenes Bild
fehlte sonst auf dem Papier. Nach 15 Sekunden öffnet er trotzdem. Ein Foto,
das nicht lädt, lässt seine Zelle weiß; Bezeichnung, Nummer und Preis stehen
weiter da.

---

## Werkbank

### Liste `/admin/kataloge`

Tabelle: Titel, Raster und Stil, Artikelzahl, zuletzt geändert. Aktionen je
Zeile: öffnen, duplizieren, löschen (mit Bestätigung über
`components/admin/confirm-action.tsx`). „Neuer Katalog" legt einen leeren an
und springt in die Werkbank.

Duplizieren kopiert Einstellungen und Artikel und hängt „(Kopie)" an den
Titel – der übliche Weg zur nächsten Ausgabe von „LIDER aktuell".

### Werkbank `/admin/kataloge/[id]`

Drei Spalten, unter `lg` gestapelt.

**Links – Artikel finden.** Wortweise Suche (`sucheWortweise()`), Filter nach
Warengruppe, Schnellfilter reduziert / neu / Topseller. Ein Klick fügt hinzu;
was schon im Katalog steht, ist markiert. Zwei Sammelknöpfe: „ganze
Warengruppe" und „alle Treffer".

Der Artikelstamm kommt einmal als Momentaufnahme in den Browser, wie bei der
Preisschild-Werkbank, über eine eigene schlanke Abfrage in
`lib/queries/kataloge.ts`.

**Mitte – Zusammenstellung.** Nach Warengruppe gegliedert. Je Zeile
Vorschaubild, Bezeichnung, Artikelnummer und der Preis der gewählten
Preisart. Verschieben über Auf- und Ab-Knöpfe, entfernen einzeln oder als
ganze Warengruppe, „Gruppe auffüllen" je Warengruppe.

Kein Drag-and-drop: bei dreihundert Zeilen ist Ziehen über mehrere
Bildschirmhöhen kein Werkzeug, und es wäre eine Bibliothek mehr.

**Rechts – Einstellungen.** Titel, Untertitel, Raster, Stil, Preisart, die
acht Schalter, Rückseitentext. Darunter Kennzahlen (Artikel im Katalog,
davon gedruckt, Seiten) und zwei Knöpfe: „Vorschau" (`?druck=0`, neuer Tab)
und „Drucken / PDF" (neuer Tab mit Druckdialog).

### Speichern

Es gibt keinen Speichern-Knopf. Jede Änderung geht sofort als Server Action
hinaus; Textfelder beim Verlassen, nicht je Tastendruck. Die Oberfläche
zeigt die Änderung gleich an und nimmt sie zurück, wenn die Action
scheitert.

Jedes änderbare Feld hat in `lib/actions/kataloge.ts` ein eigenes
Zod-Schema; ein Feldname ohne Schema wird abgewiesen – wie bei
`updateProductField()`.

Verschieben schreibt die Positionen der betroffenen Warengruppe neu
durchnummeriert, nicht nur zwei getauschte Werte: nach Entfernen und
Hinzufügen haben die Positionen Lücken und Gleichstände, und ein Tausch
zweier gleicher Zahlen bewegt nichts.

### Warnleiste

Über der Zusammenstellung, gezählt und anklickbar – ein Klick filtert auf die
Betroffenen:

- „7 ohne Foto – fehlen im Katalog"
- „3 ohne Ladenpreis – fehlen im Katalog" (bei Großhandel: „ohne Staffel")
- „12 ausverkauft"
- „2 im Shop ausgeblendet"

Die ersten beiden sind Warnungen, die letzten beiden Hinweise; sie sind
farblich und im Wortlaut getrennt. Die betroffene Zeile trägt dieselbe
Markierung. Ohne Fälle steht die Leiste nicht da.

---

## Fehlerfälle

| Fall | Verhalten |
|------|-----------|
| Katalog leer oder nichts druckbar | Der Bogen zeigt eine schlichte Hinweisseite, kein leeres Blatt; der Druckdialog bleibt zu. |
| Unbekannte `id` | 404 |
| Nicht angemeldet / kein Admin | wie der Rest von `/admin`; der Route Handler prüft selbst und antwortet 403. |
| Foto lädt nicht | Zelle bleibt weiß, Druck hängt nicht |
| Server Action scheitert | Toast mit verständlicher Meldung, Änderung zurückgenommen |
| Artikel im Stamm gelöscht | Zeile fällt per CASCADE weg |
| Migration 051 fehlt | Liste zeigt den Hinweis, dass die Migration einzuspielen ist, statt eines 500ers |

---

## Prüfung

Das Projekt hat keinen Testrunner. Geprüft wird deshalb so:

- `npm run build` für die Typen.
- `scripts/katalog-check.mjs` rechnet `seitenAufteilen()`, `druckbar()` und
  `katalogPreis()` gegen feste Eingaben: Seitenzahl je Raster, Gruppenbeginn
  auf neuer Seite, Angebot über zwei Rasterzeilen, Angebot über die
  Seitengrenze, Zwischenüberschrift nie als letzte Zeile, Ausschlüsse je
  Preisart.
- Sichtprüfung in Chrome mit echten Daten: alle sechs Kombinationen aus
  Raster und Stil, Druckvorschau, als PDF gesichert, einen Strichcode aus dem
  Ausdruck gescannt.
- Migration 051 wird von Hand eingespielt, wie die bisherigen.

CLAUDE.md bekommt mit der Umsetzung einen Abschnitt „Kataloge" und die Route
in der Seitenliste.

---

## Nicht im Umfang

- Archiv erzeugter PDFs
- serverseitig erzeugtes PDF mit Download-Knopf
- freie Textseiten, Anzeigen, redaktionelle Abschnitte
- Versand des Katalogs per E-Mail
- mehrsprachige Kataloge
- kundenindividuelle Preise
- Druckereidaten (Beschnitt, CMYK, Seitenzahl durch vier)

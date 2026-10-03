# Einkaufspreis und Namenssuche im freien Preisschild-Generator

**Datum:** 2026-10-03
**Stand:** Entwurf zur Durchsicht

Drei Teile, in einem Durchgang entworfen, weil sie an derselben Maske
zusammentreffen:

- **A – Einkaufspreis**: eine dritte Preisangabe am Artikel, nur für den
  Betrieb sichtbar, nie gedruckt.
- **B – Namenssuche** im freien Preisschild-Generator.
- **C – Bekannter Scan legt sofort ab**, statt zweimal Enter zu verlangen.

A ist unabhängig und kann zuerst oder zuletzt. B und C fassen dieselbe
Funktion `uebernehmen()` an und gehören in einen Zug.

CLAUDE.md beschreibt im Abschnitt „Artikelabgleich über den Barcode" die alte
Zwei-Enter-Regel („Enter im Scannerfeld schlägt erst nach, legt also nicht
sofort ab") und im Abschnitt „Preisschilder fürs Regal" den verdeckten Code.
Beides wird mit der Umsetzung nachgezogen.

---

## Teil A – Einkaufspreis

### Was fehlt

Das Schema führt zwei Preise: `product_variants.unit_price` (Großhandel,
gestaffelt) und `products.retail_price` (Laden, Migration 022). Was die Ware
im Einkauf gekostet hat, steht nirgends. Am Tresen ist das die eine Zahl, die
man beim Verhandeln braucht und nicht im Kopf hat.

Nebenbefund: der verdeckte Code auf dem Preisschild (`123123#1299`, `ghCode()`
in `lib/preisschild.ts`) trägt den **Großhandelspreis**; sein Kommentar nennt
ihn „Einkaufspreis". Das war immer schon widersprüchlich.

### Entscheidung: der Einkaufspreis bleibt auf dem Bildschirm

Er wird erfasst und angezeigt, aber **nie gedruckt** – nicht auf dem
Preisschild, nicht auf Bon, Beleg, Z-Bon oder Rechnung. Der verdeckte Code
bleibt unverändert der Großhandelspreis; schon gedruckte Schilder im Regal
behalten damit ihre Bedeutung. Der Kommentar in `lib/preisschild.ts` wird
richtiggestellt.

### Eigene Tabelle, keine Spalte an `products`

```sql
CREATE TABLE public.product_costs (
  product_id  UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  cost_price  NUMERIC(10,2) NOT NULL CHECK (cost_price >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_costs_admin_all ON public.product_costs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
```

Eine Spalte an `products` wäre für jeden angemeldeten Kunden lesbar. RLS wirkt
zeilenweise, und die Policy `products_read` (Migration 020) gibt angemeldeten
aktiven Kunden die **ganze Zeile** frei – deshalb ist `retail_price` heute
schon kundenlesbar. Spaltengrants lösen es nicht: Migration 034 schützt `anon`
mit einer Spaltenliste, aber Admin und Kunde sind beide `authenticated`, und
ein Grant gilt der Rolle. Eine eigene Tabelle mit `is_admin()` ist der einzige
Weg, der den Wert wirklich dichthält, und kostet nur einen Join.

`ON DELETE CASCADE`: der Einkaufspreis ist eine Angabe am Artikel und hat ohne
ihn keinen Sinn. Anders als `stock_entries`, das als Journal einen gelöschten
Artikel überlebt.

### Journalspalte

```sql
ALTER TABLE public.stock_entries
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)
    CHECK (cost_price IS NULL OR cost_price >= 0);
```

`stock_entries` ist schon admin-only (Policy `stock_entries_admin_all`,
Migration 030), hier braucht es nichts weiter. Wie bei `unit_price` und
`retail_price` gilt: `NULL` heißt „diese Buchung hat den Preis nicht
angefasst". Dadurch steht im Journal, was jede Lieferung gekostet hat – der
Wert an `product_costs` ist nur der letzte, und ohne Journal ließe sich die
Marge einer vergangenen Lieferung nicht nachrechnen.

### `record_stock_entries()` erweitern

Die Funktion (Migration 030, `SECURITY DEFINER`, prüft `is_admin()`) bekommt
`cost_price` aus dem JSON, mit derselben Regel wie die anderen beiden Preise:

- Feld leer / `NULL` → unverändert, Journalzeile behält `NULL`
- Wert gesetzt → `INSERT … ON CONFLICT (product_id) DO UPDATE` auf
  `product_costs`, und derselbe Wert in die Journalzeile

Beim Anlegen eines neuen Artikels in derselben Buchung wird die Zeile in
`product_costs` nach dem `INSERT INTO products` geschrieben, in derselben
Transaktion wie die Preisstaffel. Eine halb gebuchte Lieferung bleibt
ausgeschlossen.

### `createQuickProduct()` erweitern

`lib/actions/pos.ts`. Zwei Änderungen:

1. `cost_price` optional im Zod-Schema; gesetzt → Zeile in `product_costs`.
   Scheitert sie, bleibt der Artikel angelegt und verkaufsfähig (wie schon bei
   den Merkmalen): der Einkaufspreis lässt sich nachtragen, der Kunde am
   Tresen wartet nicht darauf.
2. **Journalzeile für den Anfangsbestand.** Heute entsteht über diesen Weg
   Bestand ohne Herkunft: `stock_available` wird gesetzt, in `stock_entries`
   steht nichts. Künftig schreibt die Funktion bei `stock_available > 0` eine
   Zeile mit `is_new_product = true`, `stock_before = 0`,
   `stock_after = stock_available` und den gesetzten Preisen.

Punkt 2 schließt die Lücke im Wunsch „beim Preisschild gescanntes Produkt auch
im Bestand anlegen": angelegt wurde es schon, nur ohne Spur im Journal.

### Eingabe – vier Stellen

| Ort | Feld |
|-----|------|
| `components/admin/wareneingang.tsx` | dritte Preisspalte „EK", bisheriger Wert als Platzhalter, leer = unverändert |
| `components/pos/pos-new-product-dialog.tsx` | Feld „Einkaufspreis", optional |
| `components/admin/preisschild-frei.tsx` | Feld „Einkaufspreis" im Block der Neuanlage, nur dort wirksam |
| `components/forms/product-form.tsx` | Feld neben Ladenpreis, plus Inline-Zeile „ek" in der Spalte „Preise" der Artikelliste |

Die Artikelliste und das Artikelformular stehen mit auf der Liste, weil sich
ein einmal getippter Einkaufspreis sonst nirgends korrigieren ließe.

Alle vier nehmen `NumericInput` (siehe CLAUDE.md, Abschnitt Zahlenfelder) –
kein `<Input type="number">` mit Zahl im State.

Im freien Preisschild-Generator ist das Feld **nur** Eingabe für einen Artikel,
der gerade entsteht, und wird bei einem Treffer aus dem Artikelstamm gefüllt.
Auf den Bogen wirkt es nicht. Die Zeile `Entwurf`/`FreiesSchild` bekommt dafür
kein Feld – der Wert hängt am Artikel, nicht am Schild, und ein Wert in
`lib/preisschild-entwurf.ts` lägen Einkaufspreise im Browser-Store.

### Anzeige beim Kassieren

Bonzeile in `components/pos/pos-terminal.tsx`, unter der Artikelnummer:

```
Akkuschrauber 18 V
110023 · 4001234567890
EK 7,40 · Marge 42 %
```

Marge als Aufschlag auf den Verkaufspreis der Zeile:
`(unitPrice − cost) / unitPrice`, gerundet auf ganze Prozent. Ohne gepflegten
Einkaufspreis steht dort nichts – eine „Marge 100 %" bei fehlendem EK wäre
eine Falschaussage. Bei freien Positionen (`productId === null`) ebenfalls
nichts: sie haben keinen Artikelstamm.

Dazu `PosProduct.costPrice` und `PosCartItem.costPrice`. Geladen über einen
Join in `POS_COLUMNS` (`cost:product_costs (cost_price)`); für einen Kunden
gibt RLS dort eine leere Beziehung zurück, und die Kasse sieht ohnehin nur der
Admin.

Gerechnet und formatiert in `lib/pricing.ts` (`marge(verkauf, einkauf)`), nicht
im Baustein: die Trefferliste der Namenssuche an der Kasse
(`pos-product-search.tsx`) zeigt denselben Hinweis, und zwei Rechenwege liefen
auseinander.

**Nicht** erweitert werden: `lib/pos-receipt.ts`, `lib/invoice.ts`,
`lib/preisschild.ts`, die Druckbogen-Route. Alles, was auf Papier geht, bleibt
unberührt.

### Migration

`supabase/migrations/047_einkaufspreis.sql`, idempotent, im Supabase SQL Editor
auszuführen: Tabelle, RLS, Journalspalte, `record_stock_entries()` neu
(`CREATE OR REPLACE`).

---

## Teil B – Namenssuche im freien Preisschild-Generator

### Was fehlt

`components/admin/preisschild-frei.tsx` gleicht nur über Barcode und
Artikelnummer ab (`sucheSchildArtikel` → `findPreisschildArtikel`,
`.eq("barcode")` dann `.eq("sku")`). Das Bezeichnungsfeld ist reiner Text. Ware
ohne lesbares Etikett lässt sich damit nicht aus dem Stamm holen, obwohl sie
dort steht – man tippt Bezeichnung und drei Preise ab.

### Lösung

Vorhandenes benutzen, nichts Neues erfinden:

- `getPreisschildArtikel(search)` in `lib/queries/preisschilder.ts` sucht
  bereits `name.ilike`, `sku.ilike`, `barcode.ilike`. Bisher nur von der
  Werkbank benutzt. Bekommt ein `limit`.
- Neue Server Action `sucheSchildArtikelNachName(begriff)` in
  `lib/actions/preisschilder.ts`, hinter `requireAdmin()`, 12 Treffer.
- Neuer Baustein `components/admin/preisschild-artikel-suche.tsx` nach dem
  Muster von `components/pos/pos-product-search.tsx`: schwebende Trefferliste,
  Pfeiltasten, Enter wählt, Escape schließt, Klick daneben schließt. Ab
  2 Zeichen, 250 ms Ruhe nach dem letzten Tastendruck.

Die Liste hängt am **Bezeichnungsfeld**, nicht an einem zweiten Suchfeld: dort
tippt man ohnehin, wenn der Barcode nichts hergab.

### Nur bei leerem Scannerfeld

Gesucht wird ausschließlich, solange im Scannerfeld **nichts** steht. Ist ein
Code da, hat er entschieden: entweder sind die Angaben schon aus dem
Artikelstamm gefüllt – dann ist die Bezeichnung die gefundene, und eine
Trefferliste darüber wäre eine Einladung, einen zweiten Artikel unter dem Code
des ersten zu wählen – oder der Code ist unbekannt, und dann wird gerade die
Bezeichnung eines neuen Artikels getippt. Ein Treffervorschlag dort führte zu
genau dem Fehler, der am teuersten ist: neue Ware unter dem Datensatz einer
alten.

Ohne Treffer erscheint auch nichts – keine Leermeldung, keine Zeile
„nichts gefunden". Das Feld ist in erster Linie ein Eingabefeld; eine Meldung
bei jedem frei getippten Aktionsschild wäre Rauschen.

### Anschluss an den Abgleich

Eine Auswahl ruft dasselbe `uebernehmeArtikel(artikel)` wie ein Scan und setzt
zusätzlich `setAufgeloest(artikel.barcode ?? artikel.sku)` und
`setTreffer(artikel)`. Ohne das hielte `uebernehmen()` den Artikel für
unbekannt und legte ihn ein zweites Mal an – mit neuer Artikelnummer und dem
Barcode, der schon vergeben ist.

Der Fall „Artikel ohne Barcode ausgewählt": `code` bleibt leer, also läuft der
Anlegeweg nicht an und das Schild wird ein reines Schild mit der Artikelnummer
aus dem Stamm. Richtig so – ein Artikel ohne Barcode soll durch einen
Schilddruck keinen erfundenen bekommen.

Die Liste schließt sich nach der Auswahl und der Fokus springt ins Preisfeld:
die nächste Frage ist „stimmt der Preis noch?".

---

## Teil C – Bekannter Scan legt sofort ab

### Was sich ändert

Heute bricht `uebernehmen()` ab, wenn ein Scan einen bekannten Artikel
gefunden hat, der noch nicht abgeglichen war:

```
toast.info("Angaben aus dem Artikelstamm übernommen – prüfen, dann ablegen.");
return;
```

Ein Handscanner schließt mit Enter ab, also braucht es heute **zwei** Enter je
Artikel: das erste holt die Angaben, das zweite legt das Schild ab. Das ist bei
einem Regal voll Ware ein Tastendruck zu viel pro Artikel.

Künftig: **bekannter Code → Angaben füllen und in einem Zug aufs Blatt.** Ein
Scan, ein Schild. Danach ist das Formular leer und das Scannerfeld im Fokus,
der nächste Artikel kann unters Gerät.

Unverändert bleibt der unbekannte Code: dort fehlen Bezeichnung und Preise, es
gibt nichts abzulegen. Der Ablauf bleibt scannen → tippen → Enter legt ab und
legt den Artikel an.

### Wohin die Kontrolle wandert

Der alte Abbruch sollte verhindern, dass ein Preis gedruckt wird, den niemand
gesehen hat. Dieser Schutz geht nicht verloren, er verschiebt sich von
„vor dem Ablegen" nach „vor dem Drucken": das Blatt ist die Liste, jedes
abgelegte Schild steht dort in Originalmaßen, ein Klick holt es ins Formular
zurück, und gedruckt wird erst auf Knopfdruck. Gegenüber dem alten Zustand
wird nichts ungeprüft gedruckt – nur nicht mehr Artikel für Artikel, sondern
am Stapel. Genau das ist die Arbeitsweise am Regal.

Die Statusmeldung bleibt: `melden("treffer", name, sku)` sagt mit Ton und
Leiste, welcher Artikel aufs Blatt ging. Ein falscher Scan fällt dadurch
sofort auf.

### Umsetzung

In `uebernehmen()` entfällt der `if (!abgeglichen && artikel)`-Abbruch. Der
Ablauf wird:

1. Code im Feld, neues Schild → auflösen, falls noch nicht abgeglichen
2. Treffer → Angaben übernehmen, `sku` aus dem Stamm, weiter zum Ablegen
3. Kein Treffer → Bezeichnung und Warengruppe prüfen, Artikel anlegen, ablegen

Haken: `uebernehmeArtikel()` schreibt über `setEntwurf()`, der abzulegende
Wert wird aber in derselben Funktion aus `entwurf` gelesen. React hat den
State bis dahin nicht aktualisiert – das Schild käme mit der leeren
Bezeichnung aufs Blatt. Abgelegt wird deshalb aus dem **Rückgabewert** von
`aufloesen()` bzw. aus `treffer`, nicht aus `entwurf`: eine kleine Funktion
`alsEntwurf(artikel, basis)` baut die Werte zusammen, und `uebernehmeArtikel()`
bleibt für die Anzeige im Formular zuständig.

Die Prüfung „ohne Bezeichnung kein Schild" rutscht dadurch hinter den
Abgleich: bei einem Treffer kommt die Bezeichnung aus dem Stamm, und ein Scan
mit leerem Namensfeld ist kein Fehler mehr.

### Zweimal derselbe Code heißt „zwei Stück"

Der freie Generator legt heute für jeden Vorgang eine neue Zeile an
(`setzeSchilder((alt) => [...alt, …])`); zusammengelegt wird nur im
Bestandsgenerator. Solange jedes Schild von Hand getippt wurde, fiel das nicht
auf. Mit der Auto-Ablage ist zweimal scannen der naheliegende Weg, zwei Schilder
zu bekommen – und daraus würden zwei getrennte Zeilen, die sich getrennt
bepreisen lassen. Der Fehler fiele erst auf dem Papier auf.

Also: ein abgelegtes Schild, dessen **Artikelnummer** der eines vorhandenen
Eintrags entspricht, erhöht dessen `anzahl`, statt eine Zeile anzuhängen.
Dieselbe Regel wie im Bestandsgenerator und bei der Mengenerfassung im
Wareneingang.

Zusammengelegt wird über die Artikelnummer und nicht über die Bezeichnung:
zwei frei getippte Schilder mit demselben Wortlaut, aber verschiedenen Preisen
sind zwei Schilder. Ein Schild ohne Artikelnummer wird nie zusammengelegt.

### Dazu in den Prüfungen

9. Bekannter Artikel scannen → Schild liegt nach einem Enter auf dem Blatt,
   mit Bezeichnung, Artikelnummer und allen Preisen aus dem Stamm.
10. Dreimal denselben bekannten Code scannen → ein Eintrag mit Anzahl 3, keine
    drei Zeilen. Zwei frei getippte Schilder ohne Artikelnummer bleiben zwei
    Zeilen, auch bei gleichem Wortlaut.
11. Bekannten Code scannen, während im Bezeichnungsfeld Text steht → der Text
    wird überschrieben, der Stamm gewinnt.

---

## Prüfen

Kein Testaufbau im Projekt – geprüft wird über `npm run build` (Typecheck, s.
CLAUDE.md) und von Hand:

1. Wareneingang: bekannter Artikel, EK leer → `product_costs` unverändert,
   Journalzeile `cost_price IS NULL`.
2. Wareneingang: EK gesetzt → `product_costs` aktualisiert, Journalzeile trägt
   den Wert.
3. Wareneingang: neuer Artikel mit EK → Artikel, Staffel, `product_costs` und
   Journalzeile in einem Zug.
4. Kasse: Artikel mit EK scannen → `EK … · Marge … %` in der Bonzeile; Artikel
   ohne EK → keine Zeile; freie Position → keine Zeile.
5. Kassenbon, Beleg-PDF, Z-Bon, Rechnung, Preisschildbogen: kein EK zu finden.
6. Als Kundenkonto angemeldet: `select` auf `product_costs` gibt null Zeilen.
7. Freier Generator: Bezeichnung tippen → Trefferliste; Auswahl füllt alle
   Felder; Ablegen legt **keinen** zweiten Artikel an.
8. Freier Generator: unbekannter Barcode mit EK → Artikel angelegt,
   `product_costs` gesetzt, Journalzeile vorhanden, Schild auf dem Blatt.

## Bewusst weggelassen

- **Durchschnittlicher Einkaufspreis** über mehrere Lieferungen. Das Journal
  hält alle Werte, eine Auswertung lässt sich nachbauen, wenn sie gebraucht
  wird. Jetzt wäre es eine zweite Wahrheit neben `product_costs`.
- **Margenauswertung** in `/kasse/umsaetze` oder `/admin`. Eigenes Vorhaben;
  hier geht es um die Zahl am Artikel.
- **EK im Shop oder in der Kundenansicht.** Nie.
- **Zweiter verdeckter Code** auf dem Preisschild. Die Fußzeile ist die
  knappste Fläche des Schilds, und gedruckt werden soll der Einkaufspreis
  nicht.

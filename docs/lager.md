# Artikelstamm, Bestand und Wareneingang

Ausgelagert aus `CLAUDE.md`. Die Regeln, die dort stehen, gelten weiter;
hier steht das Warum und das Wie.

---

## 💰 Einkaufspreis

`supabase/migrations/047_einkaufspreis.sql`. Die dritte Preisangabe neben
Großhandelsstaffel und Ladenpreis – und die einzige, die **nie gedruckt**
wird: nicht aufs Preisschild, nicht auf Bon, Beleg, Z-Bon oder Rechnung.

- **Eigene Tabelle `product_costs`**, keine Spalte an `products`. RLS wirkt
  zeilenweise, und `products_read` (Migration 020) gibt jedem angemeldeten
  aktiven Kunden die *ganze* Zeile frei – deshalb ist auch `retail_price`
  kundenlesbar. Spaltengrants lösen es nicht: Migration 034 schützt damit
  `anon`, aber Admin und Kunde sind beide `authenticated`, und ein GRANT gilt
  der Rolle. `USING (is_admin())` ist der einzige Weg, der dichthält, und
  kostet nur einen Join (`cost:product_costs (cost_price)`).
- **`ON DELETE CASCADE`**, anders als `stock_entries`: der Einkaufspreis ist
  eine Angabe am Artikel und ohne ihn sinnlos. Das Journal ist Geschichte und
  überlebt den Artikel.
- **`stock_entries.cost_price`** hält, was eine *einzelne* Lieferung gekostet
  hat. `product_costs` kennt nur den letzten Wert; ohne das Journal ließe sich
  die Marge einer vergangenen Lieferung nicht nachrechnen. `NULL` heißt wie
  bei den anderen beiden Preisen „diese Buchung hat ihn nicht angefasst".
- **Leeres Feld heißt „unverändert", nicht „0 €"**, überall. Beim Inline-Edit
  und im Artikelformular löscht es die Zeile – 0,00 € Einkauf gibt es nicht,
  und an der Kasse stünde dann „Marge 100 %".
- **Gepflegt** im Wareneingang (dritte Preisspalte „EK"), im
  Kassen-Anlegedialog, im freien Preisschild-Generator (nur für die
  Neuanlage), im Artikelformular (eigener Block) und inline in der Spalte
  „Preise" der Artikelliste.
- **Angezeigt** an der Kasse als Nebenzeile der Bonzeile und in der
  Trefferliste der Namenssuche: `EK 7,40 · Marge 42 %`. Gerechnet in
  `marge()` (`lib/pricing.ts`) auf den Verkaufspreis, nicht auf den Einkauf –
  am Tresen ist die Frage „wie viel von diesem Preis bleibt übrig". Ohne
  gepflegten Wert steht dort nichts, und bei freien Positionen auch nicht.
- **Der verdeckte Code am Regal bleibt der Großhandelspreis** (`ghCode()`).
  Ihn auf den Einkaufspreis umzustellen hieße, dass zwei Schilder im selben
  Regal unter demselben „#" verschiedene Zahlen meinen, ohne dass man es
  ihnen ansieht. Der Kommentar dort nannte den Code früher fälschlich
  „Einkaufspreis".
- **`createQuickProduct()` schreibt eine Journalzeile** für den
  Anfangsbestand (`is_new_product = true`). Vorher entstand über Kasse und
  Preisschild Bestand ohne Herkunft: `stock_available` am Artikel, nichts in
  `stock_entries`. Scheitert sie, bleibt der Artikel verkaufsfähig – eine
  Lücke in der Historie ist weniger schlimm als ein wartender Kunde.
- **Bestand im freien Preisschild-Generator mindestens 1, ohne Fehlermeldung.**
  `legeSchildArtikelAn()` klemmt den Wert auf `Math.max(1, …)`, bevor er an
  `createQuickProduct()` geht; die Vorgabe im Formular steht schon auf „1".
  Ein frisch gescannter Code steht für Ware in der Hand, und das Anlegen soll
  daran nicht hängen bleiben – anders als bei einer echten Fehleingabe wird
  hier stillschweigend nach oben gerundet, nicht abgelehnt. **Nur dieser Weg.**
  `createQuickProduct()` selbst erlaubt weiterhin 0: die Kasse legt auch
  Artikel an, die erst noch geliefert werden (Vorbestellung, noch keine
  Stückzahl im Haus) – ihr Anlegedialog zeigt „1" nur als Vorschlag, kein
  Zwang. Dieselbe Funktion, zwei Aufrufer, zwei Erwartungen: die Grenze
  gehört an den Aufrufer, der sie braucht, nicht an die gemeinsame Funktion.

---

## 📦 Bestandsführung

Wer den Bestand anfasst und wie:

| Vorgang | Wirkung |
|---------|---------|
| Checkout des Kunden (`create_order`) | `stock_reserved` +Menge – Ware ist noch da, aber vergeben |
| Admin legt Bestellung an (`create_admin_order`) | `stock_available` −Menge (Migration 023) – die Bestellung ist sofort `confirmed`, die Ware geht raus |
| Kassenverkauf (`create_pos_sale`) | `stock_available` −Menge, nach unten bei 0 begrenzt (Migration 048) |
| Wareneingang (`record_stock_entries`) | `stock_available` ±Menge, Journalzeile in `stock_entries` |

Freie Rechnungen (`create_manual_invoice`) rühren den Bestand **nicht** an:
ihre Positionen sind Freitext ohne Artikelbezug. Wer Ware abbuchen will, legt
die Rechnung über „Aus Katalog" an.

**Kein Bestand ist kein Verkaufsverbot.** Bis Migration 048 lehnte
`create_pos_sale()` eine Zeile ab, sobald die Menge den freien Bestand
überstieg – am Tresen die falsche Reihenfolge: der Kunde hat die Ware in der
Hand, dass sie im System noch fehlt (Inventurdifferenz, Wareneingang noch
nicht gebucht), ist nicht sein Problem. Scan und Namenssuche nehmen den
Artikel jetzt immer auf, Mengenänderung in der Bonzeile ebenso; es steht nur
eine Warnung in der Statusleiste ("kein Bestand – wird trotzdem gebucht").
Gebucht wird so, als wäre der Bestand da. `stock_available` selbst fällt
dabei nicht unter 0 (`GREATEST(..., 0)`) – das ist eine Vorratszahl, keine
Schuld –, die tatsächlich verkaufte Menge steht wie immer vollständig in
`pos_sale_items`. Dieselbe Regel gilt für `PosProductSearch`
(`components/pos/pos-product-search.tsx`): ein ausverkaufter Treffer ist
weiterhin rot markiert ("ausverkauft"), aber anklickbar – vorher sperrte
`disabled` die Zeile auch im Wareneingang, wo man gerade deshalb sucht, weil
ein Artikel ohne Bestand dasteht.

---

## 📥 Wareneingang (Bestandsaufnahme)

`/admin/bestand`, Grundlage `supabase/migrations/030_wareneingang.sql`.

Beim Auspacken einer Lieferung zählt nur eins: Etikett unter den Scanner,
Stückzahl tippen, nächster Karton. Deshalb kein Formular je Artikel, sondern
eine Liste, die beim Scannen wächst, und eine Sammelbuchung am Ende.

- **Ein Weg für alles.** Bekannte und unbekannte Ware landen in derselben
  Liste – ob ein Artikel neu ist, merkt man beim Auspacken nicht. Ein
  unbekannter Code wird zur Neuanlage-Zeile (Bezeichnung, Warengruppe,
  Großhandels- und Ladenpreis Pflicht bzw. optional), ein bekannter kommt mit
  seinen Daten. Zweimal derselbe Code heißt „zwei Stück", nicht „zwei Zeilen".
- **`record_stock_entries()`** macht alles in einer Transaktion: Bestand unter
  Zeilensperre lesen und schreiben, neue Artikel samt Staffel ab 1 Stück
  anlegen, Journalzeilen setzen. Eine halb gebuchte Lieferung wäre schlimmer
  als eine gar nicht gebuchte, weil niemand wüsste, wo sie abbrach.
- **`stock_entries`** ist das Journal: der Bestand am Artikel ist eine Zahl
  ohne Gedächtnis. Hier steht, wann welche Menge dazukam, was dabei am Preis
  gesetzt wurde und wer gebucht hat. Name und Artikelnummer als Schnappschuss
  wie bei `pos_sale_items`.
- **Leeres Preisfeld heißt „unverändert"**, nicht „0". Der bisherige Preis
  steht als Platzhalter im Feld. Nur was eingetragen wird, landet am Artikel
  *und* in der Journalzeile – sonst stünde in der Historie bei jedem Zugang
  ein Preis, der nie geändert wurde.
- **Der Barcode-Notausgang**: Nach dem Scan springt der Cursor ins Mengenfeld,
  damit die Stückzahl ohne Mausgriff eingegeben werden kann. Wer dort den
  nächsten Artikel scannt, schriebe den Barcode als Menge hinein. Ab acht
  Ziffern (`BARCODE_AB_STELLEN`) wird die Eingabe deshalb als Scan behandelt
  und die alte Menge wiederhergestellt: kein Zugang hat 10.000.000 Stück,
  keine EAN ist kürzer.
- Das ausführliche Artikelformular (`/admin/products/new`) bleibt daneben für
  Fotos, Beschreibung und Staffeln und verweist oben hierher.
- **Namenssuche in der Neuanlage-Zeile** (`components/pos/pos-inline-suche.tsx`,
  über `PosProduct`/`searchPosProductsAction` – dieselbe Suche wie an der
  Kasse und im freien Preisschild-Generator, nur anderer Rückgabetyp). Nicht
  jede Rechnung hat eine EAN (Alpalium keine, Iden schon): ohne Barcode landet
  jeder Scan bei „unbekannt", auch wenn der Artikel längst im Stamm steht –
  etwa weil er selbst ohne Barcode angelegt wurde. Ein Treffer wandelt die
  Zeile an Ort und Stelle in einen bekannten Artikel um (Preise, Warengruppe,
  Bestand aus dem Treffer, die schon getippte Menge bleibt), statt eine
  Dublette unter neuem Namen anzulegen. Steht der Treffer schon als eigene
  Zeile in der Liste, gilt dieselbe Regel wie beim Scannen: zusammenlegen,
  nicht zwei Zeilen. Der ursprünglich gescannte Code wird dabei **nicht** an
  den gefundenen Artikel gehängt – ein Scan, der nicht zuzuordnen war, soll
  nicht ungeprüft zu dessen neuem Barcode werden.
- **Dieselbe Namenssuche im Kassen-Anlegedialog**
  (`components/pos/pos-new-product-dialog.tsx`, Prop `onExisting`): öffnet
  sich automatisch bei unbekanntem Scan, und auch dort ist der Code oft nur
  unbekannt, nicht die Ware. Ein Treffer schließt den Dialog und kommt direkt
  auf den Bon, ohne Neuanlage.

### Sammelimport („Liste einfügen")

`components/admin/wareneingang-import.tsx`, Regeln in
`lib/wareneingang-import.ts`. Dritter Weg neben Scanner und Namenssuche – für
die Lieferung, die mit einer Rechnung oder Preisliste kommt.

- **Warum.** Der Scanner ist unschlagbar, solange die Ware vor einem steht.
  Steht alles aber schon geschrieben auf dem Papier des Lieferanten, sind
  hundert Positionen à sechs Feldern eine halbe Schicht Abtippen – und jede
  getippte Ziffer eine Gelegenheit für einen Zahlendreher.
- **Der Import schreibt nichts.** Er füllt dieselbe Aufnahmeliste, gebucht
  wird unverändert unten über `record_stock_entries()`. Ein zweiter
  Buchungsweg liefe über kurz oder lang neben dem ersten her.
- **Feste Spaltenfolge**: `Barcode ; Bezeichnung ; Menge ; GH ; EH ; EK`.
  Trenner ist Tabulator oder Semikolon – **nie das Komma**: im deutschen
  Zahlenformat steht es im Preis, und aus „9,99" würden zwei Spalten. Eine
  mitkopierte Kopfzeile wird erkannt und übersprungen.
- **Die Zeile wird nicht als Ganzes getrimmt**, nur ihre Felder. Ein
  führender Tabulator ist eine leere erste Spalte – genau das, was aus einer
  Tabellenkalkulation kommt, wenn die Ware noch keinen Barcode hat.
  Weggetrimmt rutschte die Bezeichnung in die Barcode-Spalte.
- **Leeres Preisfeld heißt „unverändert"**, wie überall im Wareneingang.
- **Nicht lesbare Zeilen werden gesammelt angezeigt**, nicht übergangen: eine
  Lieferung, bei der drei von hundert Positionen lautlos fehlen, fällt erst
  beim Zählen im Regal auf.
- **Erst Vorschau, dann übernehmen.** Abgeglichen wird in **einer** Abfrage
  (`findProductsByCodes()` / `lookupPosProducts()`, Barcode vor Artikelnummer
  wie beim Scan) – hundert einzelne Rundreisen ließen die Oberfläche eine
  halbe Minute stehen. Die Vorschau zeigt je Zeile „Zugang · Bestand x → y"
  oder „wird angelegt".
- **Zweimal derselbe Barcode heißt „zwei Stück"**, in der Liste wie beim
  Übernehmen in die Aufnahme. Zwei Zeilen desselben Artikels ließen sich
  getrennt bepreisen, und welcher Preis am Ende am Artikel steht, hinge an der
  Reihenfolge. Zusammengelegt wird nur über den Code – zwei Zeilen ohne
  Barcode sind zwei Posten, auch wenn sie gleich heißen.

### Rechnung hochladen

`components/admin/wareneingang-rechnung.tsx`, Route
`app/admin/bestand/rechnung/route.ts`, Regeln in `lib/rechnung-import.ts`,
Modellaufruf in `lib/rechnung-lesen.ts`. Vierter Weg neben Scanner,
Namenssuche und Sammelimport – für die Lieferung, die als PDF kommt.

- **Das Modell liest ab, es rechnet nicht.** Preise, Summen und Prüfungen
  entstehen in `lib/rechnung-import.ts` (mit `tests/rechnung-import.test.ts`).
  Eine falsch gelesene Zahl soll an einer Rechenprobe hängen bleiben, nicht im
  Bestand.
- **Erst Vorschau, dann Buchen.** Der Route Handler liest und gleicht ab, er
  bucht nichts. Gebucht wird vom Dialog über `recordStockEntries()` – derselbe
  Weg wie überall im Wareneingang.
- **Gegenproben.** Je Zeile: Menge × Listenpreis × (1 − Rabatt) gegen den
  Zeilenbetrag, 6 Cent Toleranz; nicht aus dem gerundeten Stückpreis (120 ×
  0,98 wären 117,60, die Rechnung sagt 117,72). Über alles: Summe der Zeilen
  gegen „Gesamt ohne MwSt.“ minus Servicegebühr/Versand. Eine rote Zeile oder
  Summenabweichung sperrt „Buchen“, bis sie korrigiert oder bestätigt ist.
- **Doppelt-Schutz.** Steht die Rechnungsnummer schon in einer
  `stock_entries.note`, sperrt die Vorschau (aufhebbar durch „Trotzdem
  buchen“). Die Notiz folgt `Lieferant, Rechnung Nr vom Datum`, so findet der
  Schutz auch Lieferungen, die früher per Skript gebucht wurden.
- **Preise neuer Artikel.** Mit UVP (Iden): Laden = UVP, Großhandel = UVP ÷
  (1 + MwSt aus `company_settings.pos_vat_rate`), Einkauf = Listenpreis ×
  (1 − Rabatt). Ohne UVP (Alpalium): Großhandel = EK × 1,30 auf 10 Cent,
  Laden = EK × 2 auf X,99 – beides aufgerundet, ganzzahlig gerechnet (100 ×
  1,3 ist in Gleitkomma 130,00000000000001 und würde auf 1,40 kippen).
- **Bekannte Artikel** bekommen nur Bestand und Einkaufspreis; Großhandels- und
  Ladenpreis bleiben (`null` heißt „unverändert“).
- **Gleicher Barcode zweimal** heißt eine Zeile mit summierter Menge.
  Zeilen ohne Barcode bleiben getrennt und sind Neuanlagen – die Vorschau
  weist darauf hin, damit ein Artikel, der schon ohne Barcode im Stamm steht,
  nicht doppelt entsteht.
- **PDF bis 4 MB**, geprüft am Dateikopf (`%PDF-`), nicht an Endung oder Typ.
  Route Handler statt Server Action, weil die nur 1 MB Body annimmt.
- **Prüfen an echten PDFs** ohne Browser:
  `scripts/rechnung-lesen-check.mjs` (Aufruf im Kopfkommentar).

---

## 🔍 Barcode-Nachschlag beim Wareneingang

`lib/ean-lookup.ts`, Actions in `lib/actions/ean.ts`. Ein unbekannter Code
wird in öffentlichen Produktdatenbanken gesucht; Bezeichnung und Foto kommen
von dort, getippt wird nur noch der Preis.

- **Nur freie Quellen**, kein Schlüssel, kein Vertrag: Open
  Food/Beauty/Products/Pet Food Facts und der freie Zugang von UPCitemdb
  (100 Abfragen/Tag; danach fällt die Quelle für den Tag still aus). Alle
  zugleich gefragt, Rangfolge = Reihenfolge in `sucheEan()`. Markenlose
  Importware kennt keine davon – dann bleibt die Zeile zum Eintippen offen.
- **„Wie oben"**: Enter in einem leeren Preisfeld einer Neuanlage übernimmt
  den Preis der Zeile darüber (steht als Platzhalter im Feld). Ein Karton
  gleich bepreister Ware ist damit Scan, Enter, Enter.
- **Vorher-Preis** als eigene Spalte, für Ware, die gleich reduziert ins
  Regal kommt. Nachgetragen nach dem Buchen über `updateProductField()` wie
  die Merkmale; `record_stock_entries()` bleibt unangetastet. Vor dem Buchen
  geprüft: ohne Ladenpreis oder nicht darüber wäre es keine Reduzierung, und
  das Schild käme weiß statt rot aus dem Drucker.
- **Die Aufnahme überlebt den Browser**: Liste und Notiz liegen als Entwurf in
  `localStorage` (`lider_wareneingang_entwurf`) und stehen nach Neuladen oder
  Absturz wieder da. Eine Erstaufnahme dauert Stunden; ein versehentliches F5
  darf sie nicht kosten. Gebucht oder verworfen heißt Entwurf weg.
- **Hauseigene Nummern (Präfix 2) gehen nicht nach draußen**
  (`istHandelscode()`): jeder Laden vergibt sie selbst, ein Treffer wäre
  Zufall. Bezeichnungen in fremder Schrift (kyrillisch, arabisch …) werden
  verworfen – die offenen Datenbanken führen den Namen in der Sprache des
  Eintragenden.
- **Fokus über `fokusWunsch`**, nicht über `requestAnimationFrame`: das Feld
  einer neuen Zeile gibt es erst nach dem Rendern, und rAF läuft in einem
  verdeckten Fenster gar nicht. Sprünge zwischen Feldern markieren den
  Inhalt (`fokus()`), sonst hängt sich die neue Zahl an die alte.
- **Der Nachschlag hält den Scanner nicht auf**: die Zeile steht sofort, die
  Bezeichnung kommt nach. Was inzwischen getippt wurde, wird nicht
  überschrieben.
- **Vorschlag, keine Wahrheit**: an der Zeile steht die Quelle und „bitte
  prüfen". Die Datenbanken sind von Freiwilligen gepflegt, Händlertitel von
  UPCitemdb sind englisch.
- **Das Bild wird erst nach dem Buchen geholt** (`uebernehmeArtikelbild()`),
  weil es den Artikel vorher nicht gibt. Übergeben wird der Barcode, nicht die
  Bildadresse – welche Adresse der Server abruft, entscheidet er selbst.
  `ladeBild()` prüft jede Station: nur https, kein Ziel im eigenen Netz,
  Dateityp und 5 MB wie beim Upload von Hand. Ein Artikel mit Foto bleibt
  unberührt.
- **Enter-Kette**: Bezeichnung → Großhandelspreis → Ladenpreis → Scanner.
  Der Ladenpreis liegt auf dem Weg, weil er aufs Preisschild kommt; der
  Vorher-Preis nicht (per Tab). Ein Barcode im Preisfeld gilt wie im
  Mengenfeld als Scan.
- **Zweiter Scan derselben neuen Ware** erhöht die Menge; zwei Neuanlagen mit
  demselben Barcode ließen die ganze Buchung scheitern.
- **Preisschilder der Lieferung**: nach dem Buchen führt ein Knopf zu
  `/admin/preisschilder?eingang=<created_at>`. Alle Zeilen einer Buchung
  tragen dasselbe `now()`, das genügt als Kennung
  (`getEingangProductIds()`). Je Artikel ein Schild.
- **„Letzte 10"**: `/admin/preisschilder?letzte=10` lädt die zuletzt
  aufgenommenen Artikel aus dem Journal (`getZuletztAufgenommen()`), in
  Scanreihenfolge. In der Werkbank stehen dafür Knöpfe (5/10/20/50) über der
  Artikelsuche; sie ergänzen die Liste, ohne Stückzahlen zu verdoppeln.

---

## 📤 Bestandsliste exportieren (PDF und Excel)

`/admin/bestand` → „Bestandsliste exportieren“. Route
`app/admin/bestand/export/route.ts` (`GET ?format=xlsx|pdf&ek=1`, nur Admin),
Zeilen und Summen in `lib/bestand-export.ts`, Zeichner in `lib/bestand-pdf.ts`
(pdf-lib) und `lib/bestand-xlsx.ts` (exceljs), Abfrage in
`lib/queries/bestand-export.ts`.

- **Ein Datenmodell, zwei Zeichner.** Sortierung (Warengruppe, dann
  Bezeichnung), Summen und Warenwert (Bestand × Einkauf) entstehen allein in
  `lib/bestand-export.ts` mit Tests; PDF und Excel zeichnen nur. So stehen in
  beiden dieselben Zahlen.
- **Seitenweise gelesen** (1000 je Anfrage). PostgREST schneidet bei 1000
  Zeilen ab; eine Bestandsliste, die bei Artikel 1000 still aufhört, wäre
  schlimmer als keine. Ein Ladefehler bricht den Export ab, statt eine
  unvollständige Datei zu liefern.
- **Einkaufspreis nur auf Wunsch.** Der Haken (Vorgabe an) schaltet Einkauf und
  Warenwert zu. Ohne ihn werden beide schon in der Route aus den Zeilen
  genommen, bevor ein Zeichner sie sieht. Die Liste ist ein internes Papier;
  sie gehört nicht in Kundenhand.
- **Excel:** echte Zahlenzellen; Artikelnummer und Barcode als Text (sonst
  macht Excel aus `0196214147249` ein `1,96E+11`); Kopfzeile fixiert, Filter,
  Summenzeile als `SUBTOTAL` – sie rechnet nur, was der Filter zeigt.
- **PDF:** A4 quer, eine Zeile je Artikel (lange Bezeichnungen mit „...“
  gekürzt), Kopfzeile auf jeder Seite, „Seite x von y“. Helvetica ohne
  eingebetteten Font: unbekannte Zeichen werden „?“, der Export bricht nicht ab.
- **Bestand** ist `stock_available`, nicht „frei verfügbar“: die Liste soll
  zeigen, was im Lager liegt. Ein negativer Bestand zählt weder bei den Stück
  noch beim Warenwert.

---

## 🔎 Schnellfilter der Artikelliste

`lib/admin-product-filter.ts`. Sechs Fragen, die im Laden täglich anfallen –
ausverkauft, Bestand knapp, ohne Barcode, ohne Ladenpreis, ohne Staffelpreis,
reduziert – als Kachelreihe über der Tabelle.

- **Gefiltert wird in der Anwendung**, nicht in der Abfrage. Zwei der Fragen
  ließen sich über PostgREST gar nicht stellen: der freie Bestand rechnet über
  zwei Spalten, die Reduzierung über die Preisstaffeln. Und die Kachel soll
  ihre Zahl auch dann zeigen, wenn nicht nach ihr gefiltert wird – ein Filter
  in der Abfrage hätte die Grundmenge schon weggeworfen.
- **UND-verknüpft**: zwei Kacheln zusammen meinen die Schnittmenge. Ein ODER
  brächte eine längere Liste statt einer kürzeren und wäre das Gegenteil eines
  Filters. (Die Flag-Auswahl darüber bleibt ODER – dort sucht man „neu *oder*
  Topseller".)
- Die Kacheln sind Links, keine Kästchen im Suchformular: eine Frage wie „was
  ist alle?" soll ein Klick beantworten. Das Formular führt sie als versteckte
  Felder mit, damit eine Suche die Auswahl nicht verwirft.
- **Sortierung** daneben im Suchformular (`ADMIN_PRODUCT_SORT` in
  `lib/queries/admin.ts`): Name A–Z als Vorgabe, „Neueste zuerst" und
  „Älteste zuerst" über `created_at`. Anders als die Kacheln läuft sie in der
  Abfrage – das Datum steht in der Zeile und muss nicht erst gerechnet werden.
  Bei Datumssortierung blendet die Zeile das Aufnahmedatum ein; immer sichtbar
  wäre es eine Spalte Rauschen.

---

## 🕒 Zuletzt benutzte Warengruppe

`getLastUsedCategoryId()` in `lib/queries/products.ts` – die Warengruppe des
zuletzt angelegten Artikels. Vorgabe in **allen** Anlegewegen: Artikelformular,
Kassen-Schnellanlage, Wareneingang.

Vorher stand überall `categories[0]`, also die alphabetisch erste – im Laden
immer „Spielwaren", auch wenn seit einer Stunde Haushaltswaren ausgepackt
werden. Wer eine Lieferung annimmt, bleibt fast immer in derselben Gruppe.

Abgeleitet aus dem Artikelbestand statt aus einer gemerkten Einstellung: so
gilt sie an jedem Gerät und nach jedem Neustart, und es gibt kein zweites Feld,
das mit der Wirklichkeit auseinanderlaufen kann. Im Wareneingang schlägt die
vorige Zeile der laufenden Aufnahme sie noch – innerhalb einer Lieferung ist
die zuletzt getippte Gruppe die bessere Auskunft.

---

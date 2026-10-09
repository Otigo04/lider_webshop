# Kasse, Rechnungen und Belege

Ausgelagert aus `CLAUDE.md`. Die Regeln, die dort stehen, gelten weiter;
hier steht das Warum und das Wie.

---

## Zweck und Altbestand

Das Kassenportal dient dem **Großhandel**: Artikel scannen, Rechnung erzeugen,
der Kunde überweist. Es ist keine Ladenkasse für den stationären Verkauf
(Entscheidung des Betreibers). Eine zertifizierte Sicherheitseinrichtung
(TSE nach KassenSichV) ist dafür nicht nötig – **solange das so bleibt**. Wird
je bar oder per Karte über den Tresen verkauft, ist das neu zu bewerten, bevor
der erste Bon rausgeht.

Aus der Ladenkassen-Zeit stehen noch im Code, wirken aber über den Zweck
hinaus. Nichts davon wird ausgebaut; ob es zurückgebaut wird, entscheidet der
Betreiber:

- Kassenbon für den Bondrucker (`/kasse/verkaeufe/[id]/bon`)
- Tagesabschluss mit Z-Nummern (`/kasse/tagesabschluss`) und Bar/Karte-Summen
- Einzelhandelsmodus „Privatkunde" mit Ladenpreisen und Barverkauf
- Bonfrage nach dem Kassieren

Die Abschnitte darunter beschreiben diese Teile unverändert, weil sie laufen
und Daten halten.

## 🏪 Ladenkasse (POS)

`/kasse/terminal`, nur für Admins. Grundlage:
`supabase/migrations/018_kasse_pos.sql`.

- **Zwei Preislisten**: Migration 022 legt `products.retail_price` an – den
  Ladenpreis für Privatkundschaft. Die Großhandelsstaffeln in
  `product_variants` bleiben unverändert. Welche Liste gilt, folgt aus dem
  ersten Schritt an der Kasse: Kundenkonto gewählt → Großhandel,
  „Privatkunde" → Einzelhandel (`PosPriceMode`, `counterUnitPrice()` in
  `lib/pricing.ts`). Ohne gepflegten Ladenpreis fällt die Kasse auf die
  kleinste Staffel zurück.

- **Scanner**: USB-Handscanner melden sich als Tastatur an und schließen jeden
  Code mit Enter ab. Der Tastatur-Wächter steht in `lib/use-scan-focus.ts` und
  wird von Kasse *und* Wareneingang benutzt: getippte Zeichen außerhalb eines
  Eingabefelds springen ins Scannerfeld. Pausiert, solange ein Dialog offen
  ist – dort tippt jemand von Hand.
- **Sofort scannen**: Der Kundenschritt (`pos-customer-step.tsx`) hat oben ein
  Scannerfeld mit Autofokus. Ein Scan dort öffnet den Bon als Barverkauf zu
  Ladenpreisen und legt den Artikel gleich auf – der häufigste Vorgang am
  Tresen darf nicht mit zwei Mausklicks beginnen. Ein Händlerkonto bleibt eine
  bewusste Auswahl.
- **Suche**: `products.barcode` zuerst, danach `products.sku` als Notnagel
  (`lib/queries/pos.ts`). Kein Treffer öffnet den Anlegedialog mit dem
  gescannten Code.
- **Buchen**: ausschließlich über `create_pos_sale()` in der Datenbank – dort
  wird der Bestand unter Zeilensperre geprüft und abgebucht und die Summen
  gerechnet. Der Browser rechnet nur für die Anzeige mit.
- **Steuersatz und Preislesart** stehen in `company_settings`
  (`pos_vat_rate`, `pos_prices_gross`) und werden unter `/admin/settings`
  gepflegt – nichts davon ist im Code festverdrahtet.
- **Freie Position**: Zeile ohne Artikelstamm für Dienstleistungen und Ware,
  die nicht im Bestand geführt wird – siehe „Freie Position an der Kasse".
- **Belege**: PDF über `lib/invoice.ts` (`buildPosReceiptPdfData`), abgelegt im
  Bucket `invoices` unter `pos/<sale_id>/<Belegnummer>.pdf`, erreichbar über
  `/kasse/verkaeufe/[id]/receipt`.
- **Nummernkreise**: Bestellungen `LG-JJJJ-00001`, Rechnungen `LDxxxxxxx`
  (Migration 029, davor `LIxxxxxxx`), Kassenbelege `LBxxxxxxx`. Bereits
  vergebene LI-Nummern bleiben stehen – eine gestellte Rechnung behält ihre
  Nummer, sonst bricht die fortlaufende Nummerierung. Der Zähler läuft weiter,
  LI und LD überschneiden sich deshalb nie.

---

## 🧾 Rechnungs- und Belegvorlage

Ein Layout für alles: `generateInvoicePdf()` in `lib/invoice.ts` zeichnet
Katalogrechnung, freie Rechnung und Kassenbeleg. Die drei `build*PdfData()`
bringen ihre Quelle vorher auf dieselbe `InvoicePdfData`-Form.

- **Aufbau**: Briefkopf (Logo rechts, Absender links, Eckdatenkasten),
  Empfängeranschrift im Fensterfeld, Positionstabelle
  *Pos. · Bezeichnung · Menge · Preis · Gesamt*, Summenblock
  (netto → USt. je Satz → Bruttobalken), Zahlungshinweis, Fußzeile.
- **Fußzeile** steht auf **jeder** Seite, vierspaltig: Anschrift (mit Inhaber),
  Kontakt, Bankverbindung, Steuernummer/USt-IdNr. Leere Angaben fallen weg.
- **Zahlungsziel** nur auf Rechnung. Setzt der Aufrufer `paymentNote`
  (Kassenbeleg: „bar erhalten"), entfällt das Fälligkeitsdatum – sonst läse
  sich ein bezahlter Bon wie eine offene Forderung.
- **Abweichende Lieferanschrift** steht in einem eigenen Kasten zwischen
  Belegtitel und Positionstabelle, in 11,5 pt fett mit goldener Kante. Nach
  ihr wird beim Packen gegriffen; in Fußnotengröße wurde sie überlesen, und
  dann ging die Ware an die Rechnungsadresse. Nur, wenn sie wirklich abweicht –
  sonst stünde dieselbe Anschrift zweimal auf dem Blatt.
- **Farbe** kommt aus dem Logo: Wappenblau trägt Tabellenkopf und Endbetrag,
  Gold die Trennlinien. Kein Schmuck ohne Funktion.
- **Umlaute und fremde Schriftzeichen**: `sicher()` entschärft jeden Text vor
  der Ausgabe. Die Standardschriften von pdf-lib sind WinAnsi-kodiert und
  werfen sonst bei „Yılmaz" oder „Şahin" – aus einer Rechnung würde ein 500er.
- **Kontaktdaten** der Fußzeile (`owner_name`, `phone`, `email`, `website`)
  stehen in `company_settings` (Migration 019) und werden unter
  `/admin/settings` gepflegt.

---

## 📄 Lieferschein

`buildDeliveryNotePdfData()` in `lib/invoice.ts`, ausgeliefert über
`/admin/orders/[id]/dokumente`. Dieselbe Vorlage wie die Rechnung, nur mit
`hidePrices` – ein eigenes Layout hieße Briefkopf, Pflichtfußzeile und
Positionstabelle ein zweites Mal pflegen.

- **Keine Beträge.** Der Zettel reist mit der Ware und wird beim Auspacken
  gelesen, womöglich vom Personal des Kunden. Statt des Summenblocks stehen
  unten Positionszahl, Gesamtmenge und zwei Linien zum Quittieren – das sind
  die Zahlen, gegen die abgezählt wird.
- **Empfänger ist, wer die Ware bekommt**, nicht der Zahlungspflichtige: im
  Anschriftenfeld steht die Lieferanschrift, ersatzweise die
  Rechnungsanschrift (`lieferanschriftZeilen(order, { immer: true })`).
- **Nummer ist die Bestellnummer**, kein eigener Nummernkreis. Ein dritter
  Zähler neben Rechnung und Kassenbeleg müsste lückenlos bleiben, ohne dass es
  dafür einen Grund gibt.
- **Route Handler mit `Content-Disposition: inline`**: `?art=beides`
  (Vorgabe) legt Rechnung und Lieferschein in **ein** PDF, `?art=rechnung`
  und `?art=lieferschein` je eines. Am Tresen geht der Druckdialog damit
  einmal auf; zwei Dateien hießen zweimal öffnen und zweimal drucken.
- Die Rechnung kommt, wenn vorhanden, als **gespeicherte Datei** aus dem
  Bucket – Blatt für Blatt dasselbe Dokument, das der Kunde per Mail bekam.
  Fehlt sie, wird sie neu gezeichnet, dann aber mit `invoices.issued_at`:
  ein zweiter Ausdruck mit heutigem Datum wäre ein anderes Dokument unter
  derselben Nummer.

---

## 🧻 Kassenbon (Bondrucker)

`/kasse/verkaeufe/[id]/bon` – **Route Handler**, keine Seite: der Bon soll ohne
Kopfleiste und Reiter im eigenen Fenster stehen; als Seite läge er unter dem
Kassenlayout und brächte dessen Rahmen aufs Papier. Erzeugt wird er von
`buildReceiptHtml()` in `lib/pos-receipt.ts`.

- **Kein ESC/POS**, sondern HTML plus `window.print()`. Damit druckt jeder
  Bondrucker, für den ein Treiber installiert ist – ohne feste IP und ohne
  Herstellerdialekt.
- **Schwarzweiß**, Monospace, `@page { size: 80mm auto; margin: 0 }`.
  `?breite=58` für schmale Rollen, `?druck=0` unterdrückt den Druckdialog.
- **Logo als Data-URI** eingebettet: eine nachgeladene Datei käme womöglich
  nach dem Druckdialog, dann fehlt sie auf dem Papier.
- Inhalt: Logo, Firmendaten samt Steuernummern, Belegnummer, Zeitpunkt,
  Positionen, Summe, Steuerausweis, Zahlart, `company_settings.pos_receipt_footer`.
- Erreichbar aus dem Abschlussdialog der Kasse und aus der Verkaufsliste.
  Das A4-PDF unter `/receipt` bleibt daneben bestehen – zwei Medien, zwei
  Layouts.

---

## 📅 Tagesabschluss (Z-Kasse)

`/kasse/tagesabschluss`, Grundlage `supabase/migrations/025_tagesabschluss.sql`.

- **`pos_day_closings`** hält je Kassentag eine Zeile mit fortlaufender
  Z-Nummer (`Z00001`), Belegzahl, Netto/USt./Brutto, Bar/Karte und dem
  Belegnummernbereich. Die Z-Nummer wird bei einem zweiten Abschluss desselben
  Tages **nicht** neu vergeben – die Reihe muss lückenlos bleiben.
- **Zwei Zahlen nebeneinander**: `pos_day_totals()` rechnet live aus den Bons,
  die Abschlusszeile hält fest, was beim Abschluss galt. Weichen sie ab, wurde
  danach noch gebucht; die Übersicht zeigt das an und bietet „Neu abschließen"
  – überschrieben wird nichts von selbst.
- **Automatik ohne Cron**: `close_open_pos_days()` schließt beim Öffnen von
  `/kasse` oder `/kasse/tagesabschluss` jeden vergangenen Tag nach, der noch
  offen ist (`holeAbschluesseNach()` in `lib/queries/kasse.ts`). Wer die Kasse
  öffnet, holt damit den vergessenen Vorabend nach. pg_cron wäre ein
  Betriebsteil mehr, der still ausfallen kann.
- **Ladenzeitzone**: Ein Kassentag endet mit dem Ladenschluss, nicht um
  Mitternacht UTC. `pos_zeitzone()`/`pos_kassentag()`/`pos_heute()` ziehen die
  Grenze in `Europe/Berlin`; die Anwendung rechnet keine Tagesgrenzen selbst
  nach.
- **Z-Bon**: `/kasse/tagesabschluss/[datum]/bon`, dasselbe Bonpapier wie der
  Kassenbon (`buildZBonHtml()` in `lib/pos-receipt.ts`, gemeinsames Gerüst
  `bonGeruest()`).
- **Löschen** (Migration 026): `delete_pos_day_closing()` nimmt einen Abschluss
  zurück, `reset_pos_day_closings()` verwirft alle und setzt die Nummerierung
  auf Z00001 – Letzteres nur hinter getippter Bestätigung, gedacht für die
  Einrichtungsphase. Die Z-Nummer eines einzeln gelöschten Abschlusses bleibt
  verbraucht: sie stand womöglich schon auf einem gedruckten Bon, und eine
  zweite Buchung unter derselben Nummer wäre schlimmer als eine Lücke.
  Verkäufe werden nie gelöscht, nur die Festschreibung.
- **`company_settings.pos_closing_from`** ist die Grenze der Automatik. Ohne
  sie legte `close_open_pos_days()` einen gerade gelöschten Tag beim nächsten
  Seitenaufruf sofort wieder an. Löschen schiebt die Grenze hinter den Tag,
  Zurücksetzen auf heute. Von Hand abschließen geht weiterhin für jeden Tag.

---

## 📈 Umsatzübersicht

`/kasse/umsaetze`. Was am Tagesabschluss fehlt: dort steht ein Monat je Seite,
weil die Z-Nummern in Monatsblöcken geführt werden. Hier steht der Zeitraum
vorn und die Auflösung daneben.

- **Zeitraum** über Presets (heute, gestern, Woche, Monat, Vormonat, Jahr,
  alles) oder zwei Datumsfelder; aufgelöst in `lib/kassen-zeitraum.ts`, immer
  auf Kassentagen in Ladenzeit und nie auf selbstgerechneten UTC-Fenstern.
  Eigene Daten schlagen das Preset.
- **Auflösung** je Tag oder je Monat. Die Monatszeilen sind die Summe der
  Tageszeilen aus `pos_day_totals` – zwei Wege zu derselben Zahl wären zwei
  Wege, sie unterschiedlich zu bekommen.
- **Z-Bon je Tag** direkt in der Liste; ein Tag ohne Abschluss zeigt
  stattdessen den Abschlussknopf. Der Z-Bon selbst liegt unverändert unter
  `/kasse/tagesabschluss/[datum]/bon`.

---

## 🔔 Signale der Kasse

`components/pos/use-kassen-ton.ts` und `components/pos/kassen-status.tsx`.
Kasse *und* Wareneingang benutzen beides.

An der Kasse liegt der Blick auf der Ware, nicht auf dem Bildschirm. Ein
einziger Piep für jeden Ausgang hieße, doch wieder hinzusehen. Es gibt deshalb
sechs Signale, hörbar und sichtbar:

| Signal | Wann | Ton |
|--------|------|-----|
| `treffer` | Artikel steht auf Bon/Liste | vertrauter Ladenpiep (`public/sounds/scanner-beep.mp3`) |
| `unbekannt` | Code ohne Treffer → Anlegen | zwei Töne abwärts |
| `neu` | Artikel angelegt (und gebucht) | drei Töne aufwärts |
| `warnung` | Bestand reicht nicht, Pflichtfeld fehlt | tiefer Doppelton |
| `fehler` | Buchung oder Abfrage gescheitert | zwei tiefe lange Töne |
| `abschluss` | Verkauf bzw. Lieferung gebucht | Dreiklang aufwärts |

- **Ton und Anzeige aus einer Hand**: `useKassenMeldung()` liefert `melden()`,
  das beides setzt. Getrennt geführt klänge irgendwann ein Fehler wie eine
  Buchung.
- **Der Ladenpiep bleibt eine Datei**, alles andere wird im Browser erzeugt
  (WebAudio). Sonst bräuchte jedes Signal eine gepflegte Tondatei, und die
  Töne wären nur so verschieden wie die Aufnahmen.
- **Statusleiste statt Toast**: sie steht fest über dem Scannerfeld, in
  Blickrichtung, und bleibt acht Sekunden. Eine Meldung am Bildschirmrand ist
  weg, bevor jemand hinsieht. Ohne Vorgang steht dort „Bereit" – eine Leiste,
  die kommt und geht, verschöbe bei jedem Scan den Bon.

---

## 🧾 Bonfrage nach dem Kassieren

Der Abschlussdialog der Kasse fragt bei **Einzelhandelspreisen** in der
Überschrift „Bon drucken?" und trägt den Druckknopf über die volle Breite;
„Ohne Bon weiter" steht daneben. Bei **Großhandelspreisen** entfällt die
Frage – ein Händler mit Konto bekommt ohnehin eine Rechnung, ihn danach zu
fragen wäre eine Frage zu viel. Dort ist „Nächster Verkauf" der Hauptweg, Bon
und PDF stehen kleiner darunter.

Der Dialog benutzt eine eigene Fußzeile statt `DialogFooter`: der reiht die
Knöpfe in einer Zeile, und drei davon liefen im Kassenfenster rechts aus dem
Rahmen.

---

## 🧾 Freie Position an der Kasse

Nicht alles, was über den Tresen geht, ist ein Artikel im Lager: eine
Reparatur, eine Anlieferung, eine Schachtel, die bewusst nie erfasst wurde.
`create_pos_sale()` kann Zeilen ohne `product_id` seit Migration 018 – sie
werden abgerechnet, aber nicht vom Bestand abgezogen. Es fehlte nur der Weg
dorthin: `components/pos/pos-free-line-dialog.tsx`, Knopf neben der
Namenssuche.

- **Getrennt vom Anlegedialog** daneben: dort entsteht ein Artikel, der
  bleibt, hier eine Zeile, die mit dem Bon endet. Beides in einem Dialog mit
  einem Schalter hieße, am Tresen eine Frage zu stellen, die niemand im
  Vorbeigehen richtig beantwortet.
- **Keine Zusammenlegung** gleichlautender Zeilen und keine
  Bestandsprüfung: zwei Reparaturen sind zwei Vorgänge, und eine
  Dienstleistung ist durch nichts im Lager begrenzt.
- Auf dem Bon steht „freie Position · nicht im Bestand" statt einer leeren
  Artikelnummer – sonst sähe die Zeile aus wie ein Artikel, dem die Nummer
  fehlt. Die Datenbank setzt in `pos_sale_items.product_sku` den Strich.

---

---

## 🔗 Altrechnungen und Kassenverkäufe einem Kunden zuordnen

Migration 063, in der Kundenakte unter „Alte Rechnungen und Kassenverkäufe
zuordnen“ (`components/admin/zuordnung-liste.tsx`, Actions in
`lib/actions/zuordnung.ts`). Für Belege aus der Zeit vor dem Bestellablauf: der
Kunde sieht nur Bestellungen, also entsteht zu jedem Beleg eine.

- **Freie Rechnung** (`assign_invoice_to_order`): Bestellung mit den Positionen
  der Rechnung, Status „geliefert“, Datum der Rechnung; `invoices.order_id`
  zeigt darauf. **Rechnungsnummer und PDF bleiben unangetastet.** Lautet die
  Rechnung auf einen anderen Kunden, wird sie umgehängt – das PDF zeigt dann
  weiter den alten Empfänger (der Dialog warnt). Gebrochene Mengen (2,5)
  werden eine Position mit dem Zeilenbetrag.
- **Kassenverkauf** (`assign_pos_sale_to_order`): Bestellung mit den Positionen,
  Zahlart bar/Karte, Abholung; `pos_sales.order_id` zeigt darauf. Bestellungen
  führen netto – waren die Preise brutto erfasst (Laufkunde), werden sie
  herausgerechnet. **`pos_sales.customer_id` bleibt unverändert**: der Beleg
  wurde als Laufkunde-Brutto gedruckt, und ein nachträgliches Konto ließe ihn
  beim Neuzeichnen anders lesen. Der Kunde lädt den **Beleg** (nicht eine
  Rechnung) auf der Bestellseite herunter (`getBelegUrlFuerBestellung`).
- **Es wird nichts gebucht**: kein Bestand, keine Kasse, keine Mail. Die
  Bestellung bekommt eine neue Bestellnummer; Rechnungs- und Belegnummern
  bleiben.
- Eine zugeordnete Bestellung hängt am Kunden: Umsatz und Bestellzahl in der
  Kundenliste zählen sie mit.

---

## ↩️ Rechnung stornieren

Migration 064, Knopf „Stornieren“ auf `/kasse/rechnungen/[id]` und in der
Rechnungszeile von `/admin/orders/[id]` (`components/admin/storno-button.tsx`).

- **Die Rechnung bleibt.** Sie wird nie gelöscht oder umgeschrieben; sie
  bekommt den Status `cancelled`. Dazu entsteht eine **Stornorechnung** mit
  eigener, lückenloser Nummer `LS0000001` (`storno_number_seq`), negativen
  Beträgen und dem Bezug auf das Original (`lib/storno.ts`, abgeleitet aus
  derselben `InvoicePdfData` wie die Rechnung – nichts wird neu gerechnet).
- **`cancel_invoice()`** vergibt Nummer und Zeitpunkt und setzt – falls die
  Rechnung an einer Bestellung hängt – auch die Bestellung auf `cancelled`,
  in einer Transaktion. Danach erzeugt `lib/storno-erzeugen.ts` das PDF
  (Bucket `invoices`, `<Rechnungs-Id>/<LS-Nummer>.pdf`, wo die Leserechte des
  Kunden greifen) und schickt es auf Wunsch per Mail. Scheitert das PDF, bleibt
  die Stornierung; „PDF erzeugen“ in der Rechnung holt es nach.
- **Nicht rückgängig zu machen.** Ein Irrtum wird mit einer neuen Rechnung
  korrigiert. Status und Bestellstatus lassen sich danach nicht mehr ändern.
- **Nicht angefasst:** Bestand/Reservierung und die Erstattung. Beides macht der
  Admin von Hand; der Dialog sagt das.
- Stornierte Rechnungen zählen nicht mehr als offene Forderung, stornierte
  Bestellungen nicht mehr im Kundenumsatz. Der Kunde sieht „Storniert“ und die
  Stornorechnung auf der Bestellseite.

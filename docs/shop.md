# Shop, Startseite und Bestellablauf

Ausgelagert aus `CLAUDE.md`. Die Regeln, die dort stehen, gelten weiter;
hier steht das Warum und das Wie.

---

## 🆕 Neu-Kennzeichnung

Ein Artikel gilt als neu, wenn das Flag `is_new` gesetzt ist **oder** er jünger
als drei Tage ist (`lib/product-flags.ts`, `NEU_TAGE`). Die Regel gilt an allen
Stellen gleich: Badge auf der Karte, Neuheiten-Sektion der Startseite, Filter
und die Route `/shop/neuheiten`.

---

## 🔻 Reduzierte Artikel

`products.list_price` (Migration 023) ist der **Vorher-Preis**, nichts weiter:
eine Behauptung über den früheren Preis, deshalb am Artikel und nicht an einer
Staffel. `reduzierung()` in `lib/pricing.ts` entscheidet, ob daraus eine
Anzeige wird – nur wenn der Wert über dem aktuellen Preis liegt und gerundet
mehr als 0 % Ersparnis übrig bleiben. Ein Cent Unterschied ist kein Angebot.

- **Der Vorher-Preis ist ein Ladenpreis** (Migration 045). Ob und wie stark
  reduziert ist, entscheidet der Vergleich mit `retail_price` – vorher wurde
  gegen den Großhandelspreis gerechnet, und aus 9,99 → 8,99 im Laden wurde im
  Shop „−55 %". **Ohne gepflegten Ladenpreis keine Reduzierung** – ein
  Rückfall auf den Großhandelspreis erfände einen Rabatt. Das Preisschild
  übergibt seinen Schildpreis (Ladenpreis, ersatzweise Staffel) selbst als
  Bezug. `reduzierung(list, angezeigt, laden)` – der dritte Parameter ist
  Pflicht, damit kein Aufrufer ihn vergisst. **Der Generator unter
  `/admin/preisschilder` und `/admin/preisschilder/frei` bekommt `vorher`
  deshalb erst gar nicht gereicht, wenn kein Ladenpreis gepflegt ist** –
  `zuPreisschildArtikel()` in `lib/queries/preisschilder.ts` setzt es auf
  `null`, sobald `preis` auf die Staffel zurückgefallen ist. Ohne diese
  Sperre reichte die Staffel als „Ladenpreis" an `schildPreis()` durch (sie
  ist ja ebenfalls > 0), und die Reduzierung wurde gegen die Staffel
  gerechnet statt gegen einen echten Ladenpreis – je nach Verhältnis beider
  Zahlen mal gar keine Reduzierung (weißes Schild mit dem alten Preis), mal
  eine erfundene (der reduzierte Preis stand als normaler Preis da). Scannt
  jemand einen reduzierten Artikel, kommt das Schild jetzt nur dann rot, wenn
  am Artikel wirklich ein Ladenpreis über dem Streichpreis steht.
- **Im Shop wird der Prozentsatz übertragen**: angezeigt wird der
  Großhandelspreis, der Streichpreis ist derselbe Preis vor der Reduzierung
  (`jetzt × list / laden`). In der Karte `range.from`, auf der Artikelseite
  der Preis der eingestellten Menge – der Streichpreis wandert mit der
  Staffel mit.
- Das Schaufenster bekommt den Ladenpreis über `product_price_range.sale_base`
  – **nur** bei Artikeln mit Streichpreis (der steht ohnehin rot am Regal).
  Alle anderen Ladenpreise bleiben intern.
- **Darstellung** über `components/sale-price.tsx`: neuer Preis in Signalrot,
  alter durchgestrichen, Prozentbadge. Drei Angaben, nicht nur Farbe – rot
  allein wäre für Farbfehlsichtige kein Unterschied.
- Der Streichpreis steht **auch in `products_public`**, anders als der
  Ladenpreis: eine Reduzierung ist Werbung und gehört ins Schaufenster.
- Gepflegt wird er im Artikelformular (eigener Block) und inline in der
  Artikelliste (Spalte „Preise", Zeile „vorher").

---

## 🛒 Bestellablauf des Kunden

Grundlage: `supabase/migrations/029_bestellablauf.sql`.

- **Ein Steuersatz für alles.** `company_settings.pos_vat_rate` gilt für die
  Ladenkasse *und* den Shop – zwei Felder für dieselbe Zahl gingen früher oder
  später auseinander. `create_order()` schreibt ihn als `orders.vat_rate` fest;
  eine alte Bestellung darf sich nach einer Satzänderung nicht rückwirkend
  anders rechnen. Gerechnet wird in `lib/vat.ts`, immer auf die Summe und nie
  auf die einzelne Zeile: sonst weicht die Summe der gerundeten Zeilen von der
  gerundeten Summe ab.
- **Netto und brutto stehen nebeneinander**, in Warenkorb, Kasse, Bestellung
  und Mail. Netto ist die Zahl, die ein Gewerbekunde vergleicht; brutto die,
  die von seinem Konto geht.
- **Lieferadresse strukturiert.** `orders.delivery_*` statt eines Textfelds –
  eine Rechnung braucht Einzelfelder. `delivery_address` bleibt als lesbare
  Zusammenfassung und für Altbestand. Im Checkout wählt der Kunde zwischen der
  hinterlegten Anschrift und einer abweichenden; die abweichende gilt nur für
  diese Bestellung und ändert sein Konto nicht.
- **Zahlart** (`orders.payment_method`): Überweisung immer, bar und Karte
  **nur** bei Selbstabholung. Das erzwingt ein CHECK, nicht nur das Formular –
  eine versendete Bestellung auf "bar" wäre eine Forderung, die niemand je
  einzieht.
- **Nach dem Absenden** landet der Kunde auf `/orders/[id]?neu=1`, nicht in der
  Liste: dort steht der Gesamtbetrag, die Bankverbindung, die Rechnungsnummer
  als Verwendungszweck und das Zahlungsziel. Er will wissen, was zu tun ist,
  und nicht seine eigene Bestellung aus einer Tabelle suchen.
- **Abholung**: Der Kunde kann einen Wunschtermin angeben (`pickup_at`,
  frühestens morgen 08:00 – kommissioniert wird nicht in der Minute der
  Bestellung). Der Admin setzt den Status auf „Abholbereit"; das läuft über
  `mark_order_ready()`, weil Status und Zeitpunkt (`ready_at`) zusammengehören,
  und verschickt automatisch `lib/emails/order-ready.ts`. Der Knopf „Erneut
  benachrichtigen" schickt dieselbe Mail noch einmal, ohne den Vorgang neu zu
  datieren.
- **Warenkorbbilder**: `CartItem.imagePath` hält den Storage-Pfad, nicht die
  URL – die ist signiert und nach Stunden abgelaufen, ein Warenkorb steht gern
  tagelang. Signiert wird beim Anzeigen (`lib/actions/cart-images.ts`,
  `lib/use-cart-images.ts`).
- **Adresse ist Pflicht bei der Registrierung.** Sie reist in
  `raw_user_meta_data` mit und wird vom Trigger `handle_new_user()` ins Profil
  geschrieben – ein `UPDATE` nach dem `signUp` ginge nicht, weil bei
  aktivierter E-Mail-Bestätigung an der Stelle noch keine Session existiert.
  Der Admin pflegt sie beim Anlegen eines Kunden im selben Formular mit: ein
  Telefonbesteller meldet sich womöglich nie selbst an.

---

## 🖼️ Warengruppen auf der Startseite

`components/category-grid.tsx`, Bilder aus `categories.image_path`
(Migration 031) oder – ohne Kachelbild – bis zu drei Artikelfotos der Gruppe
(`LandingCategory.vorschau`).

- **Bild an der Warengruppe, nicht im Quelltext**: gepflegt wird es unter
  `/admin/categories` (`components/admin/category-image.tsx`). Hochgeladen
  wird direkt aus dem Browser in den Bucket `products` unter
  `kategorien/<id>/…`; die Server Action bekommt nur den Pfad.
- **Raster statt Bildreihe**: alle Warengruppen auf einen Blick, Fläche in
  der Warengruppenfarbe aus `lib/accent-colors.ts` (dieselbe wie in
  Filterspalte und Artikelliste). Die frühere Scroll-Reihe zeigte nur, was
  hineinpasste, und bei Gruppen ohne Bild eine leere Fläche.
- **Alle Warengruppen**, auch leere („Noch keine Artikel"). Schnellleiste,
  Sortiment-Reiter und Kennzahl bleiben bei den gefüllten.
- **Höchstens drei Spalten**, große Kacheln (Name bis 1,7 rem, Kachelbild bis
  240 px, Vorschaufotos bis 128 px): der Einstieg ins Sortiment soll auffallen.
- Darunter drei **Schnellwege** zu Reduziert, Neuheiten, Topseller.

---

## 🏠 Aufbau der Startseite

`app/page.tsx`, Daten aus `getLandingData()`. Reihenfolge:
Schnellleiste → Kopfbereich (Auslage) → Katalogband → **Neuheiten** →
Warengruppen → **Reduziert** → Sortiment mit Reitern je Warengruppe →
Gefragt (Topseller) → Portalvorteile → **Häufige Fragen** → Über uns →
Kontakt.

- **Jeder Abschnitt eine eigene Fläche** (Navy, Blau getönt, Rot getönt,
  Weiß, Gold getönt …). Eine durchgehend weiße Seite ließ die Abschnitte
  ineinanderlaufen.
- **Reduziert** steht über dem Sortiment und trägt ein rotes Aktionsfeld
  („bis −xx %"): auch ein einzelner reduzierter Artikel füllt die Zeile.
  `LandingData.reduziert` ist nach Ersparnis sortiert, gezählt wird nur, was
  `reduzierung()` übrig lässt.
- **Sortiment-Reiter** (`components/sortiment-tabs.tsx`): Karten rendert der
  Server, der Client schaltet nur um. Keine Artikeldaten als JSON im Browser.
- **Neuheiten** stehen über den Warengruppen: bis zu sechs `CatalogCard`-Kacheln
  (3 × 2, auf dem Handy 2 × 3), neueste zuerst. Ohne Neuheiten entfällt der
  Abschnitt. „Neu" entscheidet allein `istNeu()` (Flag oder frisch aufgenommen).
- **Neues steht im Sortiment zuerst** (`lib/startseite.ts`): im Reiter „Alle"
  erst alle Neuheiten, danach reihum die Warengruppen; in den Gruppenreitern
  Neues vor dem Rest. Ein Artikel steht nie doppelt.
- **Topseller als Listenzeilen** (`components/catalog-row.tsx`) im Abschnitt
  „Gefragt". Die Neuheiten stehen nicht noch einmal dort.
- **Angemeldete Kunden** sehen statt Registrierungsaufrufen „Meine
  Bestellungen" und „Zum Warenkorb".
- **Häufige Fragen** stehen vor „Über uns": die wichtigsten acht offen, der
  Rest hinter einem Aufklapper, darunter der Weg zu `/faq`. Die nächste Frage
  eines Besuchers ist meist eine von diesen, und für eine einzelne Antwort
  soll niemand die Startseite verlassen müssen.
- **Bewegung** in `app/globals.css` (Abschnitt „Startseite und
  Hinweisleiste"): wandernde Farbfelder und schwebende Auslage im Kopf,
  Goldstrich unter Überschriften, Puls am Prozentzeichen, gestaffelter
  Auftritt der Reiterkarten. Alles steht bei `prefers-reduced-motion`.

---

## 📣 Hinweisleiste

`supabase/migrations/035_hinweisleiste.sql`, Tabelle `site_banners`,
gepflegt unter `/admin/settings`
(`components/forms/site-banners-settings.tsx`).

- Farbige Leiste **über** der Kopfleiste (`components/announcement-bar.tsx`,
  geladen von `components/site-banner.tsx` im Wurzellayout). Mehrere aktive
  Hinweise wechseln sich alle 5,5 s ab, beim Draufzeigen hält der Wechsel an.
- Fläche `brand`, `gold` oder `signal` – kein freies Hex, die Leiste bleibt in
  der Markenpalette. Gold trägt dunkle Schrift (Kontrast).
- Link optional: interner Pfad (`/shop/reduziert`) oder `https://…`; alles
  andere weist die Action ab.
- **Nicht in `/admin` und `/kasse`** – dort wird gearbeitet.
- Gelesen über den öffentlichen Client, RLS gibt Besuchern nur aktive Zeilen.
  Fehlt die Tabelle, zeigt die Leiste den Versandhinweis als Vorgabe.

---

## 🔻 Route „Reduziert"

`/shop/reduziert`. Anders als Neuheiten und Topseller kein Flag, sondern der
Filter `onlyReduced` (`?rabatt=1`, `lib/shop-filters.ts`), ausgewertet über
`reduzierung()` im `FilterAdapter`. Steht auch als Kennzeichen in der
Filterspalte und als Reiter in der Kopfleiste (für Admins erst ab `xl`, sonst
passen die Reiter nicht neben das Benutzermenü).

Aktiv ist in der Kopfleiste immer nur der **spezifischste** Reiter: auf
`/shop/reduziert` leuchtet nicht zusätzlich „Sortiment".

---

## ❓ Häufige Fragen

Die Fragen stehen **einmal** in `lib/faq.tsx` und werden an zwei Orten
gezeigt: `/faq` vollständig, die Startseite gekürzt auf die mit
`wichtig: true`. Zwei gepflegte Listen liefen auseinander – eine Änderung am
Zahlungsziel hätte man an einer Stelle nachgezogen und an der anderen
vergessen, und dann widersprächen sich zwei Seiten derselben Website.

- **`components/faq-liste.tsx`** rendert beide. Aufgeklappt wird über
  `<details>`: kein Skript, läuft ohne JavaScript, und die Browsersuche findet
  auch zugeklappte Antworten.
- **Benannte Tailwind-Gruppe** (`group/frage`): auf der Startseite steckt die
  Liste selbst in einem `<details>`. Mit einer namenlosen `group` drehte dessen
  offener Zustand auch alle Pfeile darin, und zugeklappte Fragen sähen offen
  aus.
- **Im Wartungsmodus erreichbar**: `/faq`, `/kontakt` und `/versand` stehen in
  `MAINTENANCE_EXEMPT_PREFIXES` (proxy.ts). Die Fußzeile bleibt unter dem
  Wartungsscreen stehen; ohne die Ausnahme führte jeder ihrer Links zurück auf
  die Wartungsseite und sah aus wie ein toter Link. Preise, Bestände und
  Konten gibt keine dieser Seiten heraus.

---

## ⚖️ Impressum

`/impressum`, gepflegt unter `/admin/settings`
(`components/forms/impressum-settings.tsx`), Regeln in `lib/impressum.ts`,
Grundlage Migration 045.

- **Abschnittsliste** in `company_settings.impressum` (JSONB,
  `[{titel, text}]`): frei anlegen, umstellen, löschen. `NULL` heißt „nie
  gepflegt" → `IMPRESSUM_VORLAGE`; eine leere Liste ist etwas anderes.
- **Platzhalter** wie `{firma}`, `{anschrift}`, `{ustid}`,
  `{registergericht}` füllt `fuelleImpressum()` aus den Firmendaten – eine
  Anschrift wird einmal gepflegt, nicht in Rechnung *und* Impressum. Fehlt
  ein Wert, steht `[Registergericht]` da: eine Lücke muss auffallen.
- Registergericht und -nummer sind eigene Felder in `company_settings`.
- Gelesen über `public_impressum()` (SECURITY DEFINER): gibt USt-IdNr. frei,
  Steuernummer und Bankdaten nicht.

---

## ☎️ Kontaktdaten für Besucher

`public_company_contact()` (Migration 036) gibt Firmenname, Anschrift,
Telefon, E-Mail und Webseite aus `company_settings` frei – sonst nichts.
`company_settings` selbst bleibt nur für Angemeldete lesbar (Bankdaten).
Gelesen über `getPublicContact()` in Fußzeile und Startseite; fehlt ein Wert,
steht der `[ … ]`-Platzhalter da.

---

## 🪟 Schaufenster der Startseite

Die vier Bilder im Kopfbereich kommen aus `LandingData.schaufenster`:
reduzierte Artikel, Topseller und Neuheiten zuerst, bei **jedem Aufruf neu
gemischt** (Fisher-Yates in `lib/queries/products.ts`, nicht
`sort(() => Math.random() - 0.5)` – das mischt nachweislich schlecht).

- **Aufgefüllt wird aus dem gemischten übrigen Katalog**, nicht aus einer
  festen Liste. Das ist kein Randfall: solange kaum ein Artikel als Topseller
  oder Neuheit markiert ist, stünden sonst bei jedem Aufruf dieselben vier
  Bilder da, obwohl gemischt wird. Erst wenn genug markiert ist, füllt der
  Rest gar nicht mehr auf.
- Gemischt wird **vor** dem Abschneiden auf 16 Kandidaten, damit über die Zeit
  das ganze Feld drankommt. Die Zahl begrenzt, wie viele Bild-URLs signiert
  werden müssen – der teure Teil der Abfrage.
- Ein gepflegter `list_price` ist nur der Verdacht auf eine Reduzierung; ob
  eine übrig bleibt, entscheidet `reduzierung()` mit den Staffelpreisen. Wird
  keine daraus, verliert der Artikel seinen Vorrang und rutscht in den
  Auffüllteil.
- Ohne Foto taugt ein Artikel nicht fürs Schaufenster.
- **Bezeichnung und Preis stehen fest unter dem Foto**, nicht erst beim
  Draufzeigen: ein Händler entscheidet am Bild, ob das Sortiment passt, und am
  Preis, ob es sich rechnet. Auf dem Telefon gibt es kein Draufzeigen – dort
  war die Angabe vorher gar nicht zu sehen. Reduzierte Artikel zeigen den
  Signalpreis mit Streichpreis, sonst „ab … netto".

---

## 🎨 Merkmale von Artikeln

`supabase/migrations/032_merkmale.sql`. Drei Ebenen, weil die Werte gepflegt
und nicht getippt werden:

| Tabelle | Inhalt |
|---------|--------|
| `product_attributes` | „Farbe", „Größe", „Material" – `kind` ist `color` oder `text` |
| `product_attribute_values` | „Rot" `#c0392b`, „XL" – der Hex-Wert hängt am Wert, nicht am Merkmal |
| `product_attribute_links` | Artikel ↔ Wert |

- **Kein Freitextfeld am Artikel.** Nach zwei Wochen stünden „rot", „Rot",
  „ROT" und „rot/orange" nebeneinander und keine Filterleiste ließe sich
  daraus bauen. Aus einer gepflegten Werteliste wird sie von allein.
- **Kein Bestand je Wert.** `products` führt eine Bestandszahl, auf die Kasse,
  Wareneingang und Bestellungen buchen. Ein Merkmal ist eine Angabe, keine
  Lagerposition. Soll der Kunde zwischen rot und blau *wählen*, sind das zwei
  Artikel – gebündelt über eine Artikelgruppe (Migration 033, eigener
  Abschnitt weiter unten). Die Merkmale sind dort die Grundlage: aus den
  Werten der Mitglieder entstehen die Auswahlfelder.
- **Gepflegt** unter `/admin/settings`
  (`components/forms/product-attributes-settings.tsx`): Merkmal anlegen, Werte
  darunter. Farbwerte über den Systemwähler (`<input type="color">`) statt
  einer eigenen Palette – er kennt die Farbe der Ware besser als jede
  Vorauswahl.
- **Angehakt** über `components/admin/merkmal-auswahl.tsx`, überall gleich:
  Artikelformular, Kassen-Anlegedialog, Wareneingang. **Zugeklappt** als
  Vorgabe – die meisten Artikel haben keine Merkmale, und vier aufgeklappte
  Farbreihen schöben Preise und Bestand aus dem Bild. Gesetzte Merkmale zeigt
  der Aufklapper als Zahl; ein zugeklappter Block darf nichts verstecken.
- **RLS**: lesen darf jeder (`anon` eingeschlossen), schreiben nur der Admin.
  Anders als die Artikel-Flags aus Migration 021 sind Merkmale nach außen
  gerichtet – sie stehen auf der Artikelseite und in der Filterspalte, auch
  ohne Konto. Preise, Bestände und Kundendaten hängen an keiner der Tabellen.
- **Im Shop**: `components/merkmal-liste.tsx` auf der Artikelseite (Kreis
  **und** Wort – ein Kreis allein ist für Farbfehlsichtige keine Angabe, das
  Wort allein sagt nichts über den Ton), Kästchen je Wert in der
  Filterspalte. Innerhalb eines Merkmals gilt **ODER** („rot oder blau"),
  zwischen zwei Merkmalen **UND** („rot, und zwar in XL"): zwei Farben
  anzuhaken soll die Liste verlängern, eine Größe dazu sie kürzen. Aufgelöst
  in `getProductIdsByValues()`; `null` heißt „kein Filter gesetzt" und ist
  nicht dasselbe wie eine leere Menge.
- Der Abschnitt „Merkmale" der Filterspalte hieß vorher so und meinte die
  festen Kennzeichen (neu, Topseller, verfügbar) – der heißt jetzt
  **Kennzeichen**.

---

## 🧩 Artikelgruppen (Ausführungen)

`supabase/migrations/033_artikelgruppen.sql`. Eine LED-Lampe in 60 W und
100 W, warmweiß und kaltweiß, sind **vier Artikel** – vier Etiketten, vier
Barcodes, vier Bestände – und **ein Angebot**, in dem der Kunde auswählt.

| Was | Wo |
|-----|-----|
| `product_groups` | gemeinsamer Titel und Beschreibungstext |
| `products.group_id` | Zugehörigkeit, `ON DELETE SET NULL` |
| `create_group_products()` | alle Kombinationen in einer Transaktion |

- **Keine `parent_id` auf products.** Bei einem Kopfartikel wäre eine
  Ausführung privilegiert; wer sie löscht, weil die 60-W-Variante ausläuft,
  ließe die übrigen ohne Titel zurück. Die Gruppe trägt den Namen, die
  Mitglieder sind gleichberechtigt.
- **Eine Ausführung ist ein ganz normaler Artikel.** Kasse, Wareneingang,
  Bestand, Bestellung und Rechnung sehen keinen Unterschied und mussten nicht
  angefasst werden. Genau deshalb diese Lösung und keine Untervarianten-Tabelle.
- **Auflösen der Gruppe löscht nichts**: die Artikel stehen danach wieder
  einzeln im Sortiment. Ein CASCADE hier nähme das Löschen einer Überschrift
  zum Anlass, vier verkäufliche Artikel samt Historie mitzunehmen.
- **Generator** unter `/admin/gruppen/new`
  (`components/admin/gruppen-generator.tsx`): Merkmalswerte ankreuzen – Farbe
  rot und blau, Watt 60 und 100 –, das Kreuzprodukt erscheint als
  **bearbeitbare** Tabelle mit Bezeichnung, Barcode, drei Preisen und Bestand.
  Was es nicht gibt (rot in 100 W), wird gestrichen. Die Vorschau ist
  bearbeitbar, weil ausgerechnet Preis und Bestand das sind, was die
  Ausführungen unterscheidet – sie hinterher einzeln nachzupflegen wäre der
  Aufwand, den der Generator gerade spart.
  Bearbeitete Zeilen hängen an der Wertkombination und nicht an einem
  Listenindex: kreuzt jemand danach eine weitere Farbe an, wird die Vorschau
  neu gerechnet und die getippten Preise finden ihre Zeile wieder.
- **Zweiter Weg**: bestehende Artikel lassen sich im Artikelformular über
  „Gehört zum Angebot" zuordnen und an der Gruppe wieder lösen. Ware, die
  schon im Regal steht, war beim Anlegen noch kein Bündel.
- **Angelegt wird in der Datenbank**, nicht in einer Schleife der Anwendung:
  jede Ausführung braucht eine Nummer aus dem Nummernkreis (`next_sku` sperrt
  die Kategoriezeile), eine Preisstaffel und ihre Merkmalsverknüpfungen. Ein
  Abbruch nach der zweiten Zeile ließe zwei halbe Ausführungen und einen
  weitergezählten Nummernkreis zurück.

### Im Shop

- **Eine Kachel je Angebot**: `gruppiere()` in `lib/product-groups.ts` faltet
  die Liste **nach** Filter und Sortierung. Behalten wird die *erste* – damit
  folgt der Vertreter der gewählten Sortierung (Preis aufsteigend → die
  günstigste) und passt zum Filter (wer „rot" anhakt, sieht die rote). Eine
  eigene Regel („immer die billigste") würde die Sortierung zerreißen.
  Gezählt wird ebenfalls nur, was den Filter überstand.
- **Gezählt werden Angebote, nicht Artikel** – in `getCategoryCounts()` und
  auf der Startseite. Stünde in der Filterspalte „12" und die Liste zeigte
  6 Kacheln, sähe das nach einem Fehler aus.
- **Auswahl auf der Artikelseite**: `components/product-variant-picker.tsx`,
  gespeist von `baueAuswahlfelder()`. **Links, keine Schaltflächen mit
  Zustand**: jede Ausführung hat eine eigene Adresse, also wechselt die Auswahl
  die Seite. Das kostet einen Seitenaufruf und bringt drei Dinge, die eine
  Client-Auswahl nicht hätte – die Adresse lässt sich verschicken, der
  Zurück-Knopf funktioniert, und Preis, Staffeln, Bestand und Fotos kommen
  frisch vom Server statt vorab für alle Ausführungen mitgeladen zu werden.
- **Wohin der Klick führt**: zur Ausführung, die den geklickten Wert trägt und
  in allen anderen Merkmalen so bleibt wie eingestellt. Gibt es die Kombination
  nicht, ersatzweise irgendeine mit dem Wert – ein toter Knopf verschwiege,
  dass es 100 W überhaupt gibt. Nur wenn der Wert im ganzen Bündel fehlt,
  bleibt die Schaltfläche stumm stehen; weggelassen sähe die Auswahl je nach
  Standpunkt anders aus.
- **Überschrift** ist der Gruppenname, die Zeile darunter die gewählte
  Ausführung: die Überschrift muss beim Wechsel stehen bleiben, sonst springt
  sie unter der Auswahl weg, die man gerade bedient.
- **Merkmale, in denen sich nichts unterscheidet**, werden kein Auswahlfeld –
  sind alle vier Lampen E27, ist eine Auswahl mit einer Schaltfläche keine.
  Die Angabe steht dann in der Merkmalsliste darunter.
- **Ohne Foto keine Ausführung**: `has_image` gilt hier wie überall
  (Migration 020). Bei einem Bündel fiele das sonst nicht auf – die Kachel ist
  ja da, nur eine Option fehlt still. `/admin/gruppen` und die Gruppenseite
  weisen deshalb ausdrücklich auf Ausführungen ohne Foto hin.

---

## 🌐 Öffentlicher Katalog ohne Sitzung

`lib/supabase/public.ts` – Client mit dem öffentlichen Schlüssel, ohne Cookies
und ohne Token. `getLandingData()` liest damit; `getCategories()` nimmt ihn
optional entgegen.

Der Grund ist keine Optimierung, sondern eine Kopplung, die es nicht geben
darf: die Startseite las den öffentlichen Katalog über den Cookie-Client, also
entschied das Sitzungstoken des Besuchers darüber, ob die *öffentliche* Seite
Warengruppen zeigt. Ein Token, das die Datenbank gerade nicht annimmt
(`JWT issued at future` – Uhrenversatz zwischen Auth und REST auf
Supabase-Seite), machte aus einem Anmeldeproblem eine leere Startseite.

RLS bleibt unverändert: der öffentliche Schlüssel kann nichts, was ein anonymer
Besucher nicht auch könnte. Alles, was von der Anmeldung abhängt – Shop, Konto,
Verwaltung, Kasse –, läuft weiter über `lib/supabase/server.ts`.

---

## ❤️ Merkliste

`lib/merkliste.ts` (Regeln), `lib/use-merkliste.ts` (Client-Store),
`components/merk-button.tsx`, Seite `/merkliste`.

- **Cookie statt localStorage** (`lider_merkliste`, Kennungen mit Punkt
  getrennt, höchstens 100): die Seite rendert der Server, und der liest nur
  Cookies. Nur Kennungen, keine Namen oder Bilder – angezeigt wird der
  aktuelle Katalog, ausgelistete Artikel fallen von selbst heraus.
- **Keine Datenbank**: merken dürfen auch Besucher ohne Konto. Preis dafür:
  die Liste gilt je Gerät.
- **Herz neben dem Link, nicht darin** – ein Knopf in einem `<a>` ist
  ungültiges HTML. Die Kachel ist deshalb ein `@container`-Rahmen, das Herz
  sitzt über `cqw` unten rechts auf dem Foto, dessen Höhe der Kartenbreite
  folgt.
- In der Kopfleiste ab `sm` als Herz mit Zähler, auf dem Handy im Klappmenü.

## 🧭 Schnellleiste und Klappmenü

`components/schnellleiste.tsx` über dem Kopfbereich der Startseite, in der
Navy-Fläche von Kopfleiste und Hero: schlichte Knöpfe mit dünnem Rand, gold
beim Überfahren; Reduziert als einziger rot gefüllt, dann Neuheiten,
Topseller, Warengruppen. Keine Symbole oder Farbpunkte – die erste Fassung
damit war überladen. Seitlich schiebbar statt umbrechend.

Merkliste, FAQ und Kontakt stehen im Klappmenü mit `nurMenue: true`: in der
breiten Leiste ist kein Platz, dort führen Fußzeile und Schnellleiste hin.

---

## 🎟️ Sonderkonditionen und Gutscheine

Grundlage: `supabase/migrations/054_kundenrabatt_und_gutscheine.sql`.

- **Sonderkondition** (`customer_conditions`): Prozent auf alles für einen
  Kunden, gepflegt in der Kundenakte `/admin/customers/[id]`. Eigene Tabelle,
  nicht an `users`: die Zeile in `users` darf der Kunde selbst ändern. Er
  sieht nur seinen Satz über `meine_kondition()`, nie die interne Notiz.
- **Gutscheine** (`vouchers`) unter `/admin/gutscheine`: Prozent oder fester
  Betrag, Mindestwert, Laufzeit (ganze Tage, Berliner Zeit), Grenze gesamt
  und je Kunde, optional an einen Kunden gebunden. Code in Großbuchstaben,
  Eingabe des Kunden wird normalisiert (`normalisiereCode()`).
- **Reihenfolge**: Warenwert → Sonderkondition → Gutschein auf den Rest
  (fest: höchstens bis 0). Mindestwert gilt gegen den Warenwert vor Rabatt.
  `create_order()` schreibt `subtotal_amount`, beide Abzüge und den Code an
  die Bestellung; `total_amount` ist der Nettobetrag danach, auf den die
  Steuer geht. Rechnung, Kasse, Buchhaltung lesen weiter nur `total_amount`.
- **Prüfung**: `gutschein_pruefen()` (intern, für Kunden gesperrt) sperrt
  die Gutscheinzeile beim Bestellen – zwei gleichzeitige Bestellungen
  bekommen nicht beide den letzten Platz. Ein fremder kundengebundener Code
  meldet „ungültig", nicht „gehört jemand anderem". Vorschau im
  Bestellformular über `gutschein_abfragen()`; ein ungültiger Code bricht die
  Bestellung ab, statt still ohne Rabatt durchzulaufen.
- **Nur für bestimmte Warengruppen** (Migration 059, `vouchers.category_ids`,
  leer = alle): der Gutschein rechnet dann auf den *Anteil*, die Summe der
  Positionen aus diesen Gruppen. Sonderkondition geht anteilig ab, der
  Mindestwert gilt gegen den Anteil; liegt nichts davon im Korb, bricht die
  Bestellung mit „gilt nur für: …" ab. Ein Feld statt Verknüpfungstabelle:
  wird eine Warengruppe gelöscht, gilt der Gutschein für nichts mehr statt
  plötzlich für alles. Der Warenkorb im Browser kennt keine Warengruppen –
  `gutschein_abfragen()` bekommt die Artikel des Korbs und nennt die, für
  die der Code gilt (`gutscheinAnteil()` in `lib/rabatt.ts`).
- **Warnung gegen den Einkaufspreis** im Gutschein-Formular
  (`unterEinkauf()` in `lib/rabatt.ts`, Daten aus `getMargenArtikel()`): bei
  einem Prozent-Gutschein steht dort, wie viele Artikel im Geltungsbereich
  nach dem Abzug unter dem Einkaufspreis liegen, mit Beispielen und dem
  höchsten Satz ohne Unterschreitung. Gerechnet gegen den niedrigsten
  Staffelpreis, ohne Sonderkondition. Nur Warnung, Speichern bleibt möglich.
  Der Einkaufspreis geht dabei nur an die Verwaltung, nie an eine
  Kundenseite. Beim festen Betrag gibt es keine Prüfung – er lässt sich
  keinem Artikel zurechnen.
- **Nur für die Erstbestellung** (Migration 076, `vouchers.nur_erstbestellung`):
  `gutschein_pruefen()` lehnt den Code ab, sobald der Kunde eine Bestellung
  hat, die nicht Entwurf oder storniert ist. Beim Bestellen liegt die neue
  Bestellung schon in `orders` – sie zählt nicht mit, weil sie `created_at =
  now()` trägt (Beginn der Transaktion) und frühere strikt älter sind. Die
  Prüfung steht an der einen Stelle, die `create_order()` und die Vorschau im
  Warenkorb gemeinsam nutzen.
- **Eingelöste Gutscheine** lassen sich nicht löschen (`ON DELETE RESTRICT`),
  nur deaktivieren – sonst zählten ihre Einlösungen nicht mehr.
- **Rechnung/Mail/Bestellseite** zeigen die Abzüge als eigene Zeilen
  (`abzugszeilen()`), im PDF ohne Positionsnummer und Menge.
- **Direktes INSERT** in `orders`/`order_items` durch Kunden ist seit 054
  entzogen: Bestellungen entstehen nur über die DEFINER-Funktionen.
- **An der Kasse** (Migration 056): `create_pos_sale()` zieht die
  Sonderkondition des gewählten Händlerkontos ab – nur auf Katalogartikel,
  nicht auf freie Positionen (Pfand, Dienstleistung: dort ist der Preis gerade
  von Hand getippt). Ebenso `create_admin_order()` für „Rechnung aus
  Katalog". Beide haben `p_apply_condition` (Vorgabe true); in Terminal und
  Rechnungsformular ist das ein Häkchen am Abzug. Anzeige über
  `kassenSummen()` bzw. `rabatte()` in `lib/rabatt.ts`. `pos_sales` hält
  `subtotal_amount`, Satz und Abzug; Bon, Beleg und Rechnung zeigen den Abzug
  als eigene Zeile.

---

## 🖼️ Werbebilder-Slider

Migration 055, Tabelle `home_slides`, gepflegt unter `/admin/startseite`,
angezeigt von `components/home-slider.tsx` ganz oben auf der Startseite.

- Bild im Bucket `products` unter `startseite/<uuid>.<ext>`, für alle lesbar
  (eigene Storage-Policy). Optional eigenes Telefonbild (6:5).
- **Fläche ist immer 3:1**, bis 1920 px breit, ohne Höhengrenze. Eine
  `max-h` machte sie auf breiten Bildschirmen flacher als das Bild und
  schnitt oben und unten ab. Auf dem Telefon 6:5 nur, wenn ein Bild ein
  eigenes Telefonbild oder Text hat; reine Werbebilder bleiben 3:1 bzw.
  werden in der hohen Fläche ganz gezeigt (`object-contain`). Der Editor
  warnt beim Hochladen, wenn das Bild mehr als 5 % von 3:1 abweicht.
- **Link „Neue Mail"**: der Wert `@kontakt` im Linkfeld (Knopf „Neue Mail an
  die Firmenadresse" im Editor) öffnet beim Klick eine neue Mail an die
  Kontaktadresse aus den Firmendaten, Betreff „Anfrage: <Titel>". Aufgelöst
  erst beim Anzeigen (`slideLink()` in `lib/slide-form.ts`): ändert sich die
  Adresse in `/admin/settings`, stimmt das Banner mit. Fehlt die Adresse,
  entfällt der Link. Gilt auch für Banner der Warengruppen; `mailto:adresse`
  ist als fester Link ebenfalls erlaubt.
- Bildtyp und Endung kommen aus den ersten Bytes der Datei, nicht aus Name
  oder Browser-Angabe (`.jfif` von Windows).
- Text optional – viele Werbebilder tragen ihn schon. Textfarbe hell/dunkel
  mit Verlauf nur hinter dem Text. Laufzeit „zeigen ab/bis"; RLS gibt
  Besuchern nur, was gerade läuft.
- Überblenden statt Schieben, 6,5 s je Bild, hält bei Maus/Fokus und per
  Pausenknopf, bei `prefers-reduced-motion` kein Autowechsel. Wischen,
  Pfeiltasten. Ein einzelnes Bild = Banner ohne Steuerung.

## 🖼️ Banner der Warengruppen

Migration 075, Tabelle `category_banners` (Aufbau wie `home_slides`, dazu
`category_id` mit `ON DELETE CASCADE`). Gepflegt unter
`/admin/startseite/gruppen`, angezeigt ganz oben auf `/shop/[category]`.

- **Mehrere Banner je Warengruppe**, gleiche Bedienung wie der Startseiten-
  Slider: Text optional, Knopf mit Link, Textfarbe, Telefonbild, Laufzeit,
  an/aus, Reihenfolge (nur innerhalb der Warengruppe). Ohne laufendes Banner
  fällt der Block ganz weg – kein Platzhalter, kein leerer Rahmen.
- **Ein Slider für beide**: `HomeSlider` hat die Prop `format`. `"gruppe"`
  hat dasselbe Format 3:1 (Telefon 6:5 wie auf der Startseite), aber kleinere
  Schrift und steht im Shop in Inhaltsbreite mit Rand statt randlos. Ein erstes
  Format 5:1 wirkte wie ein Hauptseitenbanner und wurde verworfen. Kein zweiter
  Slider daneben.
- **Ein Editor, eine Verwaltung**: `SlideEditor` (Prop `ziel`) und
  `SlideVerwaltung` bedienen Startseite und Warengruppen. Prüfung und
  Laufzeitrechnung (ganze Tage in Berlin) stehen in `lib/slide-form.ts`,
  getestet in `tests/slide-form.test.ts`. Der Editor warnt beim Hochladen,
  wenn das Bild mehr als 5 % vom Format abweicht.
- **Bilder** im Bucket `products` unter `kategorien-banner/<uuid>.<ext>`, für
  alle lesbar (eigene Storage-Policy), weil Warengruppenseiten öffentlich sind.
  Löscht man ein Banner oder die Warengruppe, räumen die Server Actions die
  Dateien mit auf.
- **Menü links** unter `/admin/startseite` (`app/admin/startseite/layout.tsx`):
  „Werbebilder Startseite" und „Banner der Warengruppen". Weitere Unterpunkte
  kommen dort als Eintrag dazu.

## E-Mail-Bestätigung neuer Konten (Migration 058)

Konten sind bis zum Klick auf den Bestätigungslink gesperrt
(`users.is_active = false`, `verified_at = null`). Alles in
`lib/verification.ts`, Mails in `lib/emails/verification.ts`, Seite
`/bestaetigen`.

- **Selbstregistrierung:** `signUp()` legt das Konto über den Admin-Client an
  (`email_confirm: true`, Supabase blockt nie selbst), sperrt es und schickt
  die Bestätigungsmail über Resend. Die Supabase-Bestätigungsmails sind damit
  nicht mehr im Spiel.
- **Vom Admin angelegt:** kein Bestätigungsschritt mehr. `createCustomer()`
  legt das Konto aktiv an (`verified_at` gesetzt) und schickt sofort die
  Willkommensmail mit Anmeldename und Einmalpasswort (`welcomeEmail`). Das
  Passwort steht zusätzlich einmal im Formular, falls der Versand scheitert
  (Meldung sagt es). „Passwort neu“ in der Kundenakte schickt bei bestätigten
  Konten ebenfalls sofort eine Mail (`newPasswordEmail`).
  Altbestand: Konten, die noch gesperrt auf den Knopf „Bestätigungsmail
  senden“ warten, laufen den alten Weg – Passwort AES-256-GCM-verschlüsselt in
  `email_verifications.temp_password_enc` (Schlüssel aus `SUPABASE_SERVICE_KEY`),
  Zugangsmail nach dem Klick (`credentialsEmail`).
- **Mail-Rahmen:** alle Transaktionsmails laufen über `wrapEmail()` in
  `lib/emails/layout.ts` – gleicher Aufbau und gleiche Farben wie der
  Newsletter (Wappenblau, Goldlinie, Logo). Bausteine: `absatz`, `kasten`,
  `feld`, `schritte`, `buttonHtml`, `kleingedrucktes`.
- **Der Link führt auf eine Seite mit Knopf**, nicht direkt auf die Aktion:
  Mail-Scanner (Outlook!) rufen Links vorab per GET ab und würden das Token
  sonst verbrauchen. Token: 48 h gültig, einmalig, nur als Hash gespeichert.
- Bestandskonten gelten als bestätigt (Backfill in 058).

## 🚫 Ausverkauft bleibt sichtbar

Ist der freie Bestand 0, bleibt der Artikel im Shop stehen – wer ihn kennt, soll
sehen, dass es ihn gibt. Auf Karte (`ProductCard`) und Artikelseite
(`ProductGallery`) liegt ein rotes Band „AUSVERKAUFT" über dem unteren
Fotorand (`components/ausverkauft-band.tsx`), das Foto ist gedämpft. Die
kleine Verfügbarkeitsmarke entfällt dann, der Warenkorb-Knopf bleibt gesperrt.
Die öffentliche Startseite zeigt keine Bestände und damit auch kein Band.


## 📬 Vorbestellung

Migration 066, Spec `docs/superpowers/specs/2026-10-10-vorbestellung-design.md`.

- **Flag am Artikel** (`products.is_preorder`, Hinweis `preorder_note`), gesetzt
  im Artikelformular oder im Flags-Menü der Artikelliste. **Wirksam nur bei
  freiem Bestand 0** (`istVorbestellbar()`, `lib/pricing.ts`): Ware eingebucht,
  Artikel normal, ohne dass jemand das Flag zurücknimmt.
- **Shop**: Band „Vorbestellbar" statt „Ausverkauft", Knopf „Vorbestellen",
  Menge nur durch `PREORDER_MAX_QUANTITY` begrenzt. Der Warenkorb trägt
  `preorder`/`preorderNote` je Position; ein alter Korb kann das Flag noch
  tragen, wenn die Ware inzwischen da ist – die Bestellung kennzeichnet nach dem
  Stand beim Absenden.
- **Gemischter Warenkorb**, eine Bestellung. `create_order()` ist unverändert
  (prüft den Bestand seit 049 nicht mehr); `order_items.is_preorder` setzt ein
  BEFORE-INSERT-Trigger, damit die Markierung an der Position bleibt.
- **Nicht betroffen**: Kasse, Katalog („Bald" bleibt manuell), öffentliche
  Startseite (kennt keine Bestände).
- **Reihenfolge beim Einspielen**: erst Migration 066, dann deployen – die
  Artikelabfrage liest `is_preorder`, ohne die Spalte fällt der Shop aus.

---

## 🗑️ Papierkorb für Artikel

Migration 061, `/admin/products/papierkorb`. Löschen ist rückholbar:
`delete_product_with_undo()` zieht vorher einen Schnappschuss (Zeile, Staffeln,
Fotoverweise, Flags, Merkmale, Einkaufspreis, Katalogauswahl) nach
`deleted_products`; `restore_deleted_product()` schreibt ihn zurück.

- **Kein `deleted_at` an `products`**: der Stamm wird an über vierzig Stellen
  gelesen; eine vergessene zeigte gelöschte Ware weiter oder ließe sie an der
  Kasse scannen. So ist gelöscht überall wirklich weg.
- **Rückgängig**: nach dem Löschen zehn Sekunden Knopf in der Meldung
  (`ConfirmAction`, Prop `undo`), danach im Papierkorb.
- **Fotodateien bleiben liegen**, bis „Endgültig löschen“ (`purgeDeletedProduct`).
- **Zurückholen scheitert mit Klartext**, wenn Artikelnummer oder Barcode
  inzwischen vergeben sind oder die Warengruppe fehlt. Ein gelöschtes Angebot
  (Gruppe) wird übergangen, der Artikel kommt ohne Gruppe zurück.
- **Nicht zurück**: Verknüpfungen in Wareneingangsjournal, Bons und
  Bestellungen (die DB setzt sie beim Löschen auf NULL; dort steht der Name).

---

## 🔑 Startpasswort und Profil-Vervollständigung

Migration 062. Gilt für Konten, die der Admin anlegt.

- **Startpasswort bleibt sichtbar**, bis der Kunde sein eigenes vergibt:
  `customer_start_passwords` (AES-256-GCM, `lib/start-password.ts`, Schlüssel
  aus `SUPABASE_SERVICE_KEY`), gelesen nur serverseitig nach `requireAdmin()`.
  Die Kundenakte zeigt es in der `StartPasswordBox` samt Text zum Weitergeben
  und ein Kennzeichen „Passwort noch nicht geändert“. Gelöscht wird es zentral
  in `clearMustChangePassword()`. Konten von vor der Migration haben keins
  gespeichert – dort „Passwort“ in der Kundenakte neu erzeugen.
- **Passwortzwang** wie bisher: `app_metadata.must_change_password` →
  `proxy.ts` leitet auf `/passwort-aendern`.
- **Pflichtangaben** (`lib/profil.ts`, `profilLuecken()`): Ansprechpartner,
  Firma, Straße, PLZ, Ort – dieselben wie bei der Registrierung. Fehlen welche:
  - nach dem ersten Login einmal `/account/vervollstaendigen` (`zielNachLogin()`
    in `lib/profil-ziel.ts`, Merker `users.profil_erinnert_at`); „Später
    ausfüllen“ ist möglich;
  - vor jeder Bestellung zwingend: `/checkout` leitet dorthin, und
    `createOrder()` weist ohne diese Angaben ab (serverseitig).
  - Admins sind ausgenommen. Die Kundenakte zeigt „Angaben unvollständig“.

---

## 📰 Newsletter

Migration 065, `/admin/newsletter`. Kunden abonnieren selbst; der Admin baut
den Newsletter aus Bausteinen und schickt ihn über Resend an alle Abonnenten.

- **Abo**: `users.newsletter_abo` (+ Zeitpunkt der Einwilligung und der
  Abmeldung). Häkchen bei der Registrierung (freiwillig, nie vorangekreuzt) und
  im Konto unter „Newsletter“. **Der Admin trägt niemanden ein** – die
  Einwilligung muss vom Kunden kommen. Empfänger: aktive Kundenkonten mit Abo.
- **Abmelden** ohne Login: signierter Link in jeder Mail
  (`lib/newsletter-token.ts`, HMAC, läuft nie ab). Der Link zeigt nur eine Seite
  mit Knopf (`/newsletter/abmelden`) – Mail-Scanner rufen Links vorab ab und
  dürfen nichts auslösen. Zusätzlich `List-Unsubscribe` + `-Post` (Ein-Klick,
  `/newsletter/abmelden/eintrag`, nur POST). `/newsletter` ist auch im
  Wartungsmodus erreichbar.
- **Dokument** (`lib/newsletter.ts`): Betreff, Vorschautext, Bausteine –
  Überschrift, Text (`**fett**`, `[Text](Link)`), Bild (Upload nach
  `newsletter/` im Bucket products), ausgewählte Artikel, **Artikel automatisch**
  (Neuheiten / Reduziert / Topseller, beim Senden gezogen: aktiv, lieferbar, mit
  Foto), Knopf, Hinweiskasten, Trennlinie. Das Layout ist fest
  (`lib/newsletter-mail.ts`): Bausteine füllen es nur. Links sind auf Shop-Pfade,
  https, mailto, tel beschränkt.
- **Editor**: Autospeichern, Vorschau ist dasselbe HTML wie der Versand (Route
  `/admin/newsletter/[id]/vorschau`, im iframe als `srcDoc`, Desktop/Handy).
  Testmail an die eigene Adresse. Nach dem Senden ist der Newsletter gesperrt;
  `sent_html` hält den Stand fest.
- **Bilder in Mails**: `/newsletter/bild?produkt=<id>` bzw. `?p=newsletter/…`
  leitet auf eine frisch signierte Adresse weiter – eine signierte Adresse in
  der Mail wäre nach Stunden tot.
- **Versand** (`lib/newsletter-senden.ts`): atomar draft → sending, Empfänger
  als Zeilen in `newsletter_deliveries`, Päckchen zu 50 per `resend.batch.send`,
  pro Empfänger eigener Abmeldelink. **Fortsetzbar**: nach einem Abbruch
  (Zeitbudget 240 s) „Versand fortsetzen“; keiner bekommt die Mail zweimal.
  „Fehlgeschlagene wiederholen“ versucht gescheiterte Zustellungen neu.
  „Verschickt“ erst, wenn mindestens eine Mail rausging.
- **Voraussetzung**: `RESEND_API_KEY` und `EMAIL_FROM` mit verifizierter Domain
  (produktiv `LIDER <noreply@lider-berlin.de>`). Absender und Antwortadresse
  stehen in `lib/email-adressen.ts`: gesendet wird von `noreply@`, jede Mail
  trägt `o.tas@lider-berlin.de` als Reply-To und nennt die Adresse in der
  Fußzeile (Transaktionsmails, Rechnung und Newsletter).
- **Einzelversand** („An Einzelne senden“, `versendeEinzeln()`): an ausgewählte
  Kunden und/oder freie Adressen, unabhängig vom Abo, ohne den Status des
  Newsletters zu ändern (auch bei schon verschickten). Kunden bekommen ihren
  Abmeldelink, Adressen ohne Konto die Fußzeile „persönlich zugeschickt“.
  Höchstens 200 je Versand. Wer den Newsletter schon erhalten hat, wird
  übersprungen – auch später beim Versand an alle (gleiche Zeile in
  `newsletter_deliveries`). Die Oberfläche warnt bei Nicht-Abonnenten: Werbung
  braucht Einwilligung oder einen persönlichen Anlass.

### Willkommensgutschein für neue Abonnenten (Migration 076)

Der Gutschein mit `vouchers.fuer_newsletter` (höchstens einer, eindeutiger
Index) geht an neue Newsletter-Abonnenten. Mitgeliefert wird `NEWSLETTER5`:
5 € fest, Mindestwert 50 € netto, einmal je Kunde, nur Erstbestellung. Im
Gutschein-Formular unter `/admin/gutscheine` änderbar; ein anderer Gutschein
mit dem Häkchen löst den bisherigen ab.

- **Alle Texte kommen aus dem Gutschein**, nichts steht fest im Quelltext
  (`lib/newsletter-angebot.ts`, getestet in `tests/newsletter-angebot.test.ts`).
  `newsletter_angebot()` gibt Art, Wert und Bedingungen heraus – **nie den
  Code** – und ist für Besucher lesbar. Läuft kein Newsletter-Gutschein, zeigen
  Startseite und Registrierung nur „Newsletter" ohne Versprechen.
- **Abschnitt auf der Startseite** (`components/newsletter-box.tsx`, vor der
  FAQ). Besucher: Knopf „Konto anlegen"; das Newsletter-Häkchen dort bleibt
  freiwillig und nie vorangekreuzt. Angemeldeter Kunde: ein Klick
  (`abonniereNewsletter()`, der Text daneben ist die Einwilligung). Angemeldeter
  Abonnent: sieht seinen Code. Admins sehen den Abschnitt nicht.
- **Eine Stelle vergibt den Code**: `schickeNewsletterGutschein()` in
  `lib/newsletter-abo.ts`, aufgerufen von Startseite, Konto-Häkchen und – bei
  der Registrierung – erst **nach der Bestätigung der E-Mail-Adresse**
  (`redeemVerification()`), damit keine Werbung an unbestätigte Adressen geht.
  `users.newsletter_gutschein_at` wird atomar gesetzt: höchstens eine Mail je
  Konto. Scheitert der Versand, wird er zurückgenommen.
- **Der Code steht auch im Konto** (`mein_newsletter_gutschein()`), solange
  `gutschein_pruefen()` ihn für diesen Kunden durchließe. Bestandsabonnenten
  vor Migration 076 bekommen weder Mail noch Anzeige.
- Mail: `lib/emails/newsletter-gutschein.ts`, Briefbogen-Layout.

---

## Restposten / B-Ware (Migration 068)

Ein Artikel mit `products.is_restposten` bleibt in seiner Warengruppe und
steht **zusätzlich** unter `/shop/restposten` – dieselbe Mechanik wie
Topseller und Neuheiten, kein zweites Kategoriesystem.

- **Eigener Artikel.** B-Ware hat eigene Artikelnummer, eigenen Bestand und
  eigenen Preis; die Neuware desselben Produkts bleibt unberührt. Es gibt
  bewusst keine Verknüpfung beider. Den Zustand („Karton eingedrückt") schreibt
  der Admin in die Beschreibung.
- **Schalter** im Artikelformular („Restposten / B-Ware") und im Flags-Menü der
  Artikelliste.
- **Kennzeichnung am Foto:** Chip „Restposten" (anthrazit, `RestpostenChip` in
  `components/product-flag-badges.tsx`) oben links auf Karten und in der
  Galerie der Artikelseite. Anthrazit, weil Rot dem Preis und Gold den
  Topsellern gehört.
- **Schaufenster:** `products_public` führt die Spalte, `anon` bekommt das
  Spaltenrecht (View ist `security_invoker`, Migration 034). Wer die Migration
  nicht eingespielt hat, bekommt im Shop Abfragefehler – erst 068, dann Deploy.
- Nav: Reiter „Restposten" neben „Reduziert", Knopf in der Schnellleiste,
  Eintrag in der Sitemap.

### Sichtbarkeit (Startseite und Warengruppenliste)

Ein Restposten ist kein eigener Bereich im Datenmodell, soll aber auffindbar
sein, ohne dass man den Reiter „Restposten" kennt:

- **Startseite:** eigener Abschnitt direkt unter „Reduziert"
  (`getLandingData().restposten`, höchstens 12, stärkste Ersparnis zuerst,
  danach zuletzt aufgenommene). Erscheint nur, wenn es Restposten gibt.
  Die Prozentzahl im Aktionsfeld entsteht wie bei Reduziert aus
  `reduzierung()` – ohne gepflegten Vorher-Preis steht dort keine Zahl.
- **Warengruppen-Kacheln der Startseite:** letzte Kachel „Restposten", dazu
  ein vierter Schnellweg neben Reduziert, Neuheiten, Topseller.
- **Filterspalte im Shop:** Eintrag „Restposten" mit Zahl unter den
  Warengruppen, durch eine Linie abgesetzt. Gezählt werden Angebote
  (`getCategoryCounts({ flag: "is_restposten" })`).
- Die Artikel behalten ihre Hauptwarengruppe; hier steht nur ein zusätzlicher
  Zugang.
- Im Schaufenster erscheint nur, was aktiv ist **und** ein Foto hat
  (`products_public`). Ein Restposten ohne Bild ist im Shop unsichtbar.

### Reduzierung bei Restposten

Bei normalen Artikeln ist der Vorher-Preis ein Ladenpreis, und gespart wird
gegenüber dem **Ladenpreis** (`reduzierung()`, Migration 045). Für Restposten
mit Vorher-Preis gilt die Ausnahme: gespart wird gegenüber dem **angezeigten
Preis**. Sonst blieb ein Restposten mit Vorher 18 € und Ladenpreis 18 € ohne
rote Auszeichnung, obwohl der Kunde 14,50 € zahlt.

- Umgesetzt in `reduzierungsBezug()` (`lib/pricing.ts`): liefert für
  Restposten mit Vorher-Preis den angezeigten Preis als Bezug, sonst den
  Ladenpreis. Angewandt an den vier Stellen, an denen Shop-Artikel gebaut
  werden (`getProducts`, `getProduct`, `getPublicProducts`, Landing,
  Schaufenster-Detail) – danach rechnen Karten, Filter „Nur reduzierte" und
  Startseite unverändert über `reduzierung()`.
- Ein Vorher-Preis **unter** dem angezeigten Preis ergibt weiter keine
  Reduzierung.
- Gilt nur im Shop. Katalog, Newsletter, Preisschild und Kasse rechnen weiter
  gegen den Ladenpreis.
- Vorher-Preis und Preis stehen nebeneinander, obwohl der Vorher-Preis oft ein
  Bruttopreis (OVP) ist und der Shop netto zeigt. Wer das vermeiden will,
  trägt den Vorher-Preis netto ein.

### Texte der Sonderseiten (Migration 069)

Der Satz unter der Überschrift von `/shop/reduziert`, `/shop/restposten`,
`/shop/neuheiten` und `/shop/topseller` steht in `shop_texte` und wird unter
`/admin/settings/texte` gepflegt. Standardtexte in `lib/shop-texte.ts`: eine
Zeile überschreibt, leer lassen löscht die Zeile. Fehlt die Tabelle, gelten die
Standardtexte; Speichern meldet dann, dass Migration 069 fehlt.

### A-Ware / B-Ware (Migration 070)

`products.restposten_ware` ('A' | 'B' | NULL = keine Angabe). A-Ware ist
einwandfreie Neuware im Auslauf, B-Ware hat Mängel oder beschädigte
Verpackung. Gesetzt im Artikelformular (Auswahl „Güteklasse" unter dem
Restposten-Haken) oder im Flags-Menü der Artikelliste (Abschnitt „Güteklasse
Restposten"; setzt das Restposten-Flag mit). Abwählen von „Restposten" im
Formular löscht die Klasse. Das Kennzeichen am Foto lautet „Restposten · A-Ware"
bzw. „· B-Ware".

**Reihenfolge beim Einspielen:** erst Migration 070, dann Deploy – wie bei 068
fragen Shop und Artikelliste die Spalte ab und laufen ohne sie in Fehler.

## 🕑 Öffnungszeiten

`company_settings.opening_hours` (Migration 071): sieben Einträge, Index 0 =
Montag, je `{open, close}` oder `null` (geschlossen). Gepflegt unter
`/admin/settings/oeffnungszeiten`. Eine Rechenstelle für Anzeige und Prüfung im
Browser: `lib/oeffnungszeiten.ts`; in der Datenbank prüft der Trigger
`orders_abholzeit_pruefen()` (BEFORE INSERT auf `orders`) – Europe/Berlin
(`pos_zeitzone()`), Öffnung und Schluss inklusive. Besucher ohne Konto lesen
die Zeiten über `public_opening_hours()`.

- **Angezeigt** auf `/kontakt`, in der Fußzeile, im Checkout bei
  Selbstabholung und als `openingHoursSpecification` in den strukturierten
  Daten der Startseite.
- Der Trigger greift nur bei Abholung mit Termin und nur, wenn der Kunde selbst
  bestellt (`customer_id = auth.uid()`); Admin-Rechnungen und Kassenverkäufe
  bleiben unberührt. Der Mindestvorlauf (morgen 08:00) bleibt in
  `create_order()`.

## 💳 Zahlart und Erstbestellung

Migration 072.

- Zahlarten: `prepayment` (Vorkasse), `transfer` (**Auf Rechnung** – der Wert
  blieb, damit Altbestellungen stimmen), `cash`, `card` (nur Abholung).
- **Auf Rechnung** nur, wenn `darf_auf_rechnung()` wahr ist (ohne Parameter,
  liest `auth.uid()`): der Kunde hat mindestens eine Rechnung mit
  `status = 'paid'`. Entschieden in `create_order()`; der Checkout zeigt die
  Kachel nur ausgegraut (`disabled={!darfRechnung}` in
  `components/forms/checkout-form.tsx`; `erlaubteZahlarten()` in
  `lib/zahlart.ts` entscheidet nur über die Liste).
- **Zahlung vor Ware:** Trigger `orders_zahlung_vor_ware()` – eine
  Vorkasse-Bestellung kann erst auf `ready`/`shipped`/`delivered`, wenn ihre
  Rechnung `paid` ist. „Bezahlt" setzt der Admin wie bisher am
  Bestelldetail (`InvoiceStatusSelect`); es gibt kein `orders.paid_at`.
- Ein Bestandskunde ohne als bezahlt markierte Rechnung beginnt mit Vorkasse.
- **Reihenfolge beim Einspielen:** Migration 072 gemeinsam mit dem Deploy des
  Checkout-Codes einspielen – der Checkout des vorigen Stands kann
  `prepayment` nicht senden.

## 🧾 Steuernummer

`users.vat_id` nimmt USt-IdNr. **oder** Steuernummer auf und ist Pflicht für
Kunden, die selbst bestellen (`profilLuecken()`, Migration 073). Das Format
prüft `lib/steuernummer.ts` beim Speichern und in `profilLuecken()`; es gibt
keine Online-Abfrage (VIES/BZSt). Der Trigger `orders_steuernummer_pruefen()`
lehnt eine Bestellung des Kunden selbst ab, wenn `vat_id` leer ist (nur auf
Vorhandensein, das Format prüft der Code); Admin-Rechnungen und Kassenverkäufe
bleiben unberührt.

## 🔎 Suche

`components/site-search.tsx` – GET-Formular auf `/shop?q=` in Kopfleiste,
Klappmenü und Startseite. Gesucht wird wortweise (`lib/search.ts`), auch für
Besucher (ohne Preise).

## 💬 Preis auf Anfrage (Migration 077)

Schalter am Artikel (`products.price_on_request`): Artikelformular „Preis auf
Anfrage", Flags-Menü der Artikelliste und die Flags-Leiste für mehrere
Artikel.

- **Im Shop**: statt Preis und Warenkorb steht „Preis auf Anfrage". Auf der
  Artikelseite ersetzt `components/preis-anfrage.tsx` den Kaufbereich: Knopf
  „Preis anfragen" öffnet eine neue Mail an die Kontaktadresse aus den
  Firmendaten, mit Artikelname und -nummer im Text (`lib/preisanfrage.ts`;
  ohne Adresse führt der Knopf auf `/kontakt`). Gilt für Kunden und Besucher.
- **Wo ausgeblendet wird**: zentral in den Abfragen (`lib/queries/products.ts`)
  über `anfrageIds()` (`lib/queries/preis-auf-anfrage.ts`, Funktion
  `preis_auf_anfrage()`): der Artikel kommt mit leeren Staffeln und ohne
  Vorher-Preis an, die Karten zeigen dann ihren „kein Preis"-Fall. Ebenso
  Newsletter-Artikel (Text „Preis auf Anfrage") und „Erneut bestellen"
  (landet unter „nicht mehr lieferbar").
- **Eigener Text je Artikel** (Migration 078, `products.price_on_request_note`):
  im Artikelformular klappt unter dem Haken „Preis auf Anfrage" ein Textfeld auf
  (höchstens 500 Zeichen). Er ersetzt auf der Artikelseite den Absatz unter
  „Preis auf Anfrage". Leer = Standardtext (`PREIS_ANFRAGE_STANDARDTEXT` in
  `lib/preisanfrage.ts`, `preisAnfrageText()`). Gelesen über
  `preis_auf_anfrage_text(id)` (`lib/queries/preis-anfrage-text.ts`), nur für
  sichtbare Artikel mit Flag. Ohne 078 gilt der Standardtext; ein Text lässt sich
  dann nicht speichern (Meldung im Formular).
- **Nicht bestellbar, auch nicht per alten Warenkorb**: BEFORE-INSERT-Trigger
  auf `order_items` (wie bei der Vorbestellung); `create_order()` bleibt
  unverändert. Admins (Rechnung aus Katalog) sind ausgenommen.
- **Die Preise bleiben am Artikel gepflegt** (die Staffel ist weiter
  Pflicht im Formular): Kasse, Rechnung aus Katalog und Preisschild rechnen
  damit. Ausgeblendet wird nur im Shop, und nur in der Anzeige: ein
  angemeldeter Kunde könnte die Staffeln über die REST-Schnittstelle lesen.
- **Artikelbearbeitung** lädt den Artikel mit `getProduct(id, { preiseBehalten:
  true })`. Sonst kämen die Staffeln leer an und würden beim Speichern die
  echten überschreiben.
- **Ohne Migration** läuft der Shop unverändert weiter (alle Preise sichtbar);
  „Preis auf Anfrage" setzen meldet dann, dass 077 fehlt.
- **Kataloge** (`/admin/kataloge`): ein Artikel mit „Preis auf Anfrage" bleibt
  im Heft; statt des Preises druckt `lib/katalog-bogen.ts` den Hinweis „Preis auf
  Anfrage" – in Kachel und Groß neben dem Strichcode, in der Liste über die
  Breite der drei Preisplätze, in der Ausführungs-Tabelle über die Preisspalten
  der Zeile. Im Heft „ohne Preise" steht nichts (`aufAnfrage` in
  `KatalogArtikel`, `katalogPreis()` liefert null; `tests/katalog-anfrage.test.ts`).
  Er zählt nicht als „kein Preis", die Werkbank markiert ihn mit „Preis auf
  Anfrage". Gelesen in `lib/queries/kataloge.ts` direkt aus `products`, damit
  auch ausgeblendete Artikel stimmen.
- **Nicht angepasst**: Preisschilder drucken den Preis weiter, wie er am
  Artikel steht (Regalschild im Laden).

---

## 🔍 Bildvorschau (Verweilen auf dem Foto)

`components/bild-vorschau.tsx`. Bleibt der Zeiger auf einem Foto, erscheint
es groß in der Bildschirmmitte, wie die Vorschau bei Amazon.

- **Kacheln** (`ProductCard`, `PublicProductCard`, `CatalogCard`): nach
  `VORSCHAU_KACHEL_MS` (3,5 s). **Produktseite** (`ProductGallery`): sofort
  (`VORSCHAU_SOFORT_MS`), das große Bild ist dort schon vorgeladen.
- **Maus:** weg, sobald der Zeiger das Foto verlässt, die Seite scrollt oder
  Escape kommt. Die Vorschau fängt keine Mausereignisse ab – Klick und Link
  darunter bleiben wie sonst.
- **Finger:** gedrückt halten (mindestens 350 ms). Die Vorschau steht, solange
  der Finger liegt; der Klick beim Loslassen wird verschluckt, damit man nicht
  versehentlich in die Produktseite springt. Wischt der Finger, wird abgebrochen.
  Nicht auf einem echten Gerät geprüft: iOS zeigt bei langem Drücken auf einen
  Link ggf. sein eigenes Menü (`-webkit-touch-callout: none` ist gesetzt).
- Das große Bild lädt versteckt schon beim Draufzeigen, nicht erst beim
  Erscheinen.

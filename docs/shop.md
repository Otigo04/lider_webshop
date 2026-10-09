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
- **Höchstens drei Spalten**, große Kacheln (Name bis 1,7 rem, Bild bis
  176 px): der Einstieg ins Sortiment soll auffallen.
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
- Bildtyp und Endung kommen aus den ersten Bytes der Datei, nicht aus Name
  oder Browser-Angabe (`.jfif` von Windows).
- Text optional – viele Werbebilder tragen ihn schon. Textfarbe hell/dunkel
  mit Verlauf nur hinter dem Text. Laufzeit „zeigen ab/bis"; RLS gibt
  Besuchern nur, was gerade läuft.
- Überblenden statt Schieben, 6,5 s je Bild, hält bei Maus/Fokus und per
  Pausenknopf, bei `prefers-reduced-motion` kein Autowechsel. Wischen,
  Pfeiltasten. Ein einzelnes Bild = Banner ohne Steuerung.

## E-Mail-Bestätigung neuer Konten (Migration 058)

Konten sind bis zum Klick auf den Bestätigungslink gesperrt
(`users.is_active = false`, `verified_at = null`). Alles in
`lib/verification.ts`, Mails in `lib/emails/verification.ts`, Seite
`/bestaetigen`.

- **Selbstregistrierung:** `signUp()` legt das Konto über den Admin-Client an
  (`email_confirm: true`, Supabase blockt nie selbst), sperrt es und schickt
  die Bestätigungsmail über Resend. Die Supabase-Bestätigungsmails sind damit
  nicht mehr im Spiel.
- **Vom Admin angelegt:** Passwort wie bisher sichtbar beim Anlegen. Die Mail
  geht erst auf den Knopf „Bestätigungsmail senden“ in der Kundenakte raus.
  Das Passwort liegt bis zum Klick AES-256-GCM-verschlüsselt in
  `email_verifications.temp_password_enc` (Schlüssel abgeleitet aus
  `SUPABASE_SERVICE_KEY`) und geht nach dem Klick als Zugangsmail raus.
  Wird der Service-Key gedreht, sind offene Passwörter nicht mehr lesbar –
  dann „Passwort“ in der Kundenakte neu erzeugen.
- **Der Link führt auf eine Seite mit Knopf**, nicht direkt auf die Aktion:
  Mail-Scanner (Outlook!) rufen Links vorab per GET ab und würden das Token
  sonst verbrauchen. Token: 48 h gültig, einmalig, nur als Hash gespeichert.
- Bestandskonten gelten als bestätigt (Backfill in 058).

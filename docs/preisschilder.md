# Preisschilder

Ausgelagert aus `CLAUDE.md`. Die Regeln, die dort stehen, gelten weiter;
hier steht das Warum und das Wie.

---

## 🏷️ Preisschilder fürs Regal

`/admin/preisschilder`, Grundlage `supabase/migrations/038_preisschilder.sql`
(Symbole), `039_schildgroessen.sql` (Maße) und `040_preisschild_labels.sql`
(Labelfarben). Artikel anklicken, Stückzahl
setzen, drucken – A4 mit Schnittlinien.

- **Nichts wird gespeichert außer Symbolen und Maßen.** Ein Preisschild ist
  eine Momentaufnahme; ändert sich der Preis, wird neu gedruckt. Eine abgelegte
  Schilderliste wäre eine zweite Wahrheit, die still veraltet. Bleiben müssen
  die Symbolbibliothek (`label_icons`, Bucket `products` unter `etiketten/…`)
  und die Schildgrößen (`label_sizes`) – beides Werkzeug, das über den
  einzelnen Druck hinausgeht.
- **Maße in Millimetern, frei einstellbar.** Am Regal wird gemessen, welches
  Schild in die Schiene passt, nicht ausgerechnet, wie oft es auf ein Blatt
  geht. Gepflegt werden deshalb Breite und Höhe; Spalten, Zeilen und die Zahl
  je Bogen fallen in `raster()` ab. Abgerundet und nicht gestreckt: ein Schild,
  das 64,5 mm breit sein soll, ist auf dem Papier 64,5 mm breit, und was rechts
  übrig bleibt, ist Rand. Die Alternative wäre, die eingegebenen Maße
  stillschweigend zu verändern – dann passte das ausgeschnittene Schild nicht
  mehr in die Schiene.
- **Schriftgrößen sind Anteile der Schildhöhe**, keine Tabelle je Format:
  seit die Maße frei eingegeben werden, gibt es keine feste Liste, für die man
  sie pflegen könnte. Ein doppelt so hohes Schild trägt doppelt so große
  Schrift. Preis und Fußzeile werden zusätzlich auf die Breite begrenzt –
  aus einem abgeschnittenen „1.299,0" würde ein falscher Preis.
- **`hoehenBedarf()` ist die Bremse dazu**: es rechnet, was ein voll besetztes
  Schild braucht (zweizeilige Bezeichnung, Preis, beide Haarlinien, Fußzeile).
  Zu groß geratene Anteile fielen sonst nicht auf dem Bildschirm auf, sondern
  erst auf dem abgeschnittenen Papier. Daraus folgt auch die Untergrenze von
  25 mm: darunter trägt ein Schild seine drei Angaben nicht mehr lesbar.
- **Euro groß, Cent hochgestellt** (`preisTeile()`). Nicht als Zierde: „12" in
  voller Größe und „99" halb so groß brauchen weniger Breite als „12,99", der
  Betrag kann dadurch rund anderthalbmal so groß gesetzt werden. Genau die Zahl
  liest man aus zwei Metern.
- **Streichpreis neben den Preis, Prozentfeld in den Kopf.** Beides
  untereinander kostete Höhe, die auf einem 40-mm-Schild der Preis besser
  braucht. Das Prozentfeld ist schwarz mit weißer Schrift – die einzige
  Auszeichnung, die auf weißem wie auf rotem Grund gleich stark steht.
- **Die Preiszeile ist modular** (`preisAufteilung()`), Rangfolge **Preis,
  Prozentfeld, Streichpreis**. Gewählt wird, was den Preis am größten lässt:
  Streichpreis und Prozentfeld *neben* dem Preis (breites Schild) oder in
  einer Reihe *unter* ihm (schmales, hohes Schild; die Reihe darf bis 55 %
  schrumpfen). Bliebe dem Preis weniger als 62 % seiner möglichen Größe,
  fällt erst der Streichpreis weg, dann das Prozentfeld – reduziert sagt dann
  die rote Fläche. Vorher gab es nur „Preis kleiner": auf 25 mm Breite stand
  er in 2 mm da, und der Streichpreis lief trotzdem über den Rand. Eine
  Anordnung, deren Teile nicht in den Block passen, scheidet aus, statt
  abgeschnitten zu werden.
- **Obergrenzen wachsen mit**: ein A4-großes Schild trägt einen 108-mm-Preis.
  Die alten Deckel (Preis 40 mm) machten aus einem Plakat ein großes Blatt
  mit kleinem Schild darauf.
- **Geprüft über 18 Formate × 6 Schildtypen** (25 × 25 bis 194 × 281 mm;
  vierstellige Preise, Reduzierung, Label, Strichcode, Nicht-EAN): kein
  Element verlässt die Zelle, keins überdeckt ein anderes. Gemessen im
  gerenderten Bogen, nicht gerechnet.
- **Zwei Haarlinien** teilen das Schild in Kopf, Preis und Fußzeile. Sie tragen
  nichts vor, sie ordnen: drei Felder statt drei Zeilen, die im Weißraum
  schwimmen.
- **Der Bogen ist ein Route Handler** (`/admin/preisschilder/druck`), wie der
  Kassenbon und aus demselben Grund: als Seite läge er unter dem
  Verwaltungslayout und brächte Reiterleiste und Rahmen aufs Papier. **POST**,
  weil fünfzig Artikel mit Namen und Preisen keine Adresszeile überleben; die
  Werkbank schickt ein Formular mit `target="_blank"`. Übermittelt werden die
  **Maße**, nicht die Kennung der Größe: ein Bogen, der geöffnet wird, nachdem
  jemand die Größe geändert hat, käme sonst anders aus dem Drucker als in der
  Vorschau stand.
- **HTML statt PDF.** Die Schilder sind reines Rechteck-Layout, das CSS-Grid
  ohne eine Zeile Koordinatenrechnerei setzt. `print-color-adjust: exact` ist
  dabei nicht Kosmetik: ohne das druckt Chrome die roten Flächen weiß.
- **Rot heißt reduziert**, sonst weiß – die Schrift ist **weiß auf Rot,
  schwarz auf Weiß** (`rot ? "#fff" : "#000"`, dieselbe Verzweigung in
  `preisschild-vorschau.tsx` und `preisschild-bogen.ts`). Ob rot, entscheidet
  `reduzierung()` wie im Shop: ein Cent Unterschied ist kein Angebot. Die
  Fläche ist `#e2001a` und nicht das Markenrot `#a02020` – dagegen steht auch
  weiße Schrift noch deutlich ab. Der verdeckte Code hinter der Artikelnummer
  folgt derselben Umkehr: `CODEROT` auf weißem Schild, Weiß auf rotem. Nur das
  schwarze Prozentfeld bleibt unverändert schwarz mit weißer Schrift – es
  steht unabhängig von der Schildfarbe und ist auf beiden gleich stark.
- **Strichcode** in der Fußzeile rechts neben der Artikelnummer, scannbar
  (`lib/barcode.ts`, Schalter „Strichcode aufs Schild", **Vorgabe an** – ein
  scannbares Regal spart Abtippen, und der Code kostet weder Höhe noch
  Preisgröße). Ein
  Schalter für den **ganzen Bogen**, nicht je Zeile: die Fußzeile bekommt
  dadurch auf allen Schildern dieselbe Höhe, und nebeneinander auf einem Blatt
  stehen die Preise sonst auf verschiedenen Höhen. Eigener Abschnitt weiter
  unten.
- **Der verdeckte Großhandelspreis** steht als Anhängsel hinter der
  Artikelnummer: `123123#1299` für 12,99 € Einkauf (`ghCode()` – Cent, kein
  Euro-Zeichen, kein Trennzeichen). **Mindestens dreistellig**: 0,77 € ergäbe
  sonst `#77`, und das liest sich wie 77 Euro; mit führender Null steht dort
  `#077`, und drei Stellen heißen immer Euro-Euro-Cent-Cent. Auf weißem Schild
  rot, auf rotem weiß. Leeres Feld heißt „kein Code", nicht „0 €".
- **Maße und Farben stehen in `lib/preisschild.ts`**, nicht im Bogen-Baustein:
  die Werkbank zeigt dieselbe Vorschau in Originalgröße, die der Drucker aufs
  Papier bringt (`components/admin/preisschild-vorschau.tsx`, Millimeter statt
  Tailwind-Klassen). Zwei Zahlensätze liefen auseinander, und dann wäre die
  Vorschau genau das, was sie nicht sein darf: ungefähr.
- **Schnittlinien als eigene Ebene** über dem Raster, nicht als Zellrahmen: die
  rote Fläche füllt die Zelle bis zur Kante, damit nach dem Schnitt kein weißer
  Rand bleibt. Eine Linie *innerhalb* der Zelle läge unter der Farbe und wäre
  ausgerechnet auf dem roten Schild unsichtbar. Die Ebene ist so groß wie die
  Schilder zusammen, nicht wie die Nutzfläche – auf dem Reststreifen hat keine
  Schnittlinie etwas zu suchen.
- **Rand rundum 8 mm** (`RAND` rechts/unten, `RAND_OBEN_LINKS` oben/links –
  näher kommt kein üblicher Bürodrucker an die Kante). Oben und links stand
  der Rand früher auf 0, damit die Papierkante den Schnitt ersetzte; in der
  Praxis schnitt der Drucker dort die äußere Kante der ersten Schilder ab.
  8 mm ist die größte Zahl, bei der die Einteilung der Standardformate gleich
  bleibt (Groß 72 × 56: 2 × 5 = 10 je Bogen, 5 Zeilen = 280 von 281 mm). Wer
  den Rand erhöht, verliert dort eine Zeile. Dieselbe Randverteilung steht an
  zwei Stellen – Druckbogen (`lib/preisschild-bogen.ts`) und
  Bildschirmvorschau (`components/admin/preisschild-bogen-vorschau.tsx`) – aus
  demselben Grund wie bei den Maßen: zwei auseinanderlaufende Zahlensätze
  wären eine Vorschau, die nicht mehr stimmt.
- Die letzte Seite bleibt angebrochen; leere Zellen sind weißes Papier, kein
  Fehler.
- Ein zweiter Klick auf denselben Artikel heißt „noch eins", nicht „noch eine
  Zeile" – wie beim Wareneingang. Zwei Zeilen für denselben Artikel ließen sich
  getrennt bepreisen, und das fiele erst auf dem Papier auf.
- **Bezeichnung: zwei Zeilen, voll ausgeschrieben** (`nameSatz()`).
  Umbrochen wird am Wortende, solange der Rest in Zeile 2 passt. Sonst wird
  getrennt: zuerst an einem vorhandenen Bindestrich („Akku- / Bohrschrauber"),
  erst dann mitten im Wort mit „-" (mind. 3 Zeichen vorn, 2 hinten, nie
  mitten in einer Zahl). Reicht es nicht, wird die Schrift bis auf die Hälfte
  kleiner, erst dann gekürzt. Gemessen wird per Canvas im Browser – im
  Druckbogen läuft dieselbe Funktion, per `toString()` eingebettet. Deshalb
  darf `nameSatz()` nichts außerhalb ihres Körpers verwenden.
- **Labels** (Migration 040, `label_badge_colors`): „Neu", „Topseller" und die
  Artikel-Flags aus den Einstellungen, farbig unten rechts in der Fußzeile.
  Angelegt werden sie nicht hier, nur ihre Farbe wird gewählt und gespeichert.
  Schriftfarbe schwarz/weiß nach Leuchtdichte (`labelSchrift()`).
- **Preis und Großhandelspreis schreiben beim Verlassen des Felds in den
  Artikel zurück** (`preisSynchronisieren()`/`ghSynchronisieren()`, über
  `updateProductField()` – dieselbe Funktion wie die Inline-Bearbeitung der
  Artikelliste). Das Preisschild ist das Werkzeug, mit dem der Ladenpreis
  geändert wird, keine Kopie davon: wer hier aus 1,99 € 3,50 € macht, soll
  nicht hinterher noch einmal ins Artikelformular. **Preis und Streichpreis
  gehen als Paar** über `setzeAktionspreis()` (eine Schreibung auf
  `retail_price` + `list_price`, ausgelöst beim Verlassen eines der beiden
  Felder): mit Vorher-Preis über dem Preis steht der Artikel danach überall
  als reduziert da (Katalog, Shop, Filter, Label „Reduziert"), ohne ihn wird
  `list_price` gelöscht – ein übrig gebliebener Streichpreis hielte den
  Artikel sonst still weiter für reduziert. Früher war ein reduzierter
  Artikel hier ausgenommen; dann blieb die Aktion auf dem Papier und der
  Stamm, Katalog und Shop wussten nichts davon. Der Großhandelspreis läuft
  weiter einzeln (`updateProductField()`) – der verdeckte Code ist immer der
  tatsächliche Einkaufskanal, eine Aktion ändert daran nichts. Ausgelöst auf `onBlur`, nicht auf jeden Tastendruck:
  `NumericInput` meldet während des Tippens Zwischenstände, und jeder davon
  eine Schreibung wäre ein Preis, der mitten im Tippen kurz falsch im Stamm
  steht.
- **Die Werkbank hält den Katalog als Momentaufnahme** (`artikel`-Prop,
  einmal serverseitig geladen – „die Werkbank will den ganzen Bestand im
  Browser haben, um ohne Nachfrage filtern zu können"). Eine Preis- oder
  Großhandelsänderung landet zwar sofort in der Datenbank, die Momentaufnahme
  selbst bliebe aber auf dem alten Stand: wer die Zeile entfernt und den
  Artikel über die Suche erneut hinzufügt, bekäme sonst den alten Preis
  zurück. `preisSynchronisieren()`/`ghSynchronisieren()` rufen deshalb nach
  einer erfolgreichen Schreibung `router.refresh()` – die Momentaufnahme
  kommt frisch vom Server, ohne den Zustand der schon aufgebauten
  Schilderliste zu verlieren. `updateProductField()` revalidiert dafür
  zusätzlich `/admin/preisschilder`.

---

## ✍️ Freie Preisschilder

`/admin/preisschilder/frei`. Derselbe Bogen, dieselben Regeln, nur ohne
Artikelliste: Bezeichnung und Preis werden getippt oder über den Barcode aus
dem Artikelstamm geholt.

- **Warum zwei Generatoren.** Der Bestandsgenerator deckt das Regal ab, aber
  nicht den Rest des Ladens – Restposten, die nie erfasst wurden, ein
  Aktionsstapel vor der Tür, eine Dienstleistung an der Wand. Dafür sonst
  einen Artikel anzulegen hieße, für ein Stück Papier eine Artikelnummer ohne
  Bestand ins System zu stellen. Dieselbe Begründung wie bei der freien
  Position an der Kasse.
- **Nichts ist neu gerechnet.** Die Maske schickt ihre Zeilen an denselben
  Route Handler (`/admin/preisschilder/druck`) und setzt ihre Vorschau mit
  denselben Funktionen aus `lib/preisschild.ts`. Ein frei eingegebenes Schild
  soll im Regal neben einem aus dem Bestand stehen, ohne dass man sieht,
  welches woher kam. Ein zweiter Zeichenweg liefe über kurz oder lang neben
  dem ersten her.
- **Ausfüllen, Enter, nächstes Schild.** Das Formular ist ein `<form>` mit
  Absenden, nicht nur ein Knopf: Enter aus jedem Feld legt das Schild aufs
  Blatt. Danach wird zurückgesetzt, was zur Ware gehört (Bezeichnung, Preise,
  Nummern), nicht was zur Serie gehört (Symbol, Label) – ein stehen
  gebliebener Preis wäre ein falsch bepreistes Schild, und das fällt erst im
  Regal auf.
- **Der Fokus springt erst nach dem Neuzeichnen zurück**
  (`requestAnimationFrame`). Sofort gerufen löst er das Verlassen des eben
  getippten Zahlenfeldes aus, und `NumericInput` meldet beim Verlassen den
  Wert, der dann im DOM steht – die Stückzahl stünde nach dem Zurücksetzen
  wieder im Feld, und das nächste Schild käme ungefragt vierfach aufs Blatt.
- **Das Blatt ist die Liste** (`components/admin/preisschild-bogen-vorschau.tsx`):
  der A4-Bogen samt Rastern, verkleinert über `transform: scale()`, gezeichnet
  von derselben Komponente wie die Einzelvorschau. Der Maßstab wird gemessen
  und nicht geraten – eine Hülle in Millimetern sagt dem Skript, wie viele
  Pixel ein A4-Blatt hier breit ist. Ein Klick auf ein Schild holt es ins
  Formular zurück; „Kopie" lässt die Angaben stehen und legt sie als neues
  Schild ab, was nach einer Preisrunde der häufigste Fall ist.
- **Die Liste liegt im Browser**, nicht in der Datenbank
  (`lib/preisschild-entwurf.ts`, externer Store wie der Warenkorb). An der
  Regel „ein Preisschild wird nicht gespeichert" ändert das nichts – es gibt
  keine zweite Wahrheit auf dem Server. Ein von Hand getippter Stapel ist aber
  zu teuer, um ihn an ein versehentliches Neuladen zu verlieren; beim
  Bestandsgenerator stellen zwei Klicks dieselbe Liste wieder her.
- **Werkzeug wird nicht doppelt gepflegt**: Schildgrößen, Symbole und
  Labelfarben stehen weiter beim Bestandsgenerator und gelten hier mit. Die
  Unterleiste (`components/admin/preisschild-nav.tsx`) führt zwischen beiden
  hin und her – kein eigener Reiter in der Verwaltungsleiste, die ist voll.

### Artikelabgleich über den Barcode

Der Scan steht oben im Formular, weil er den Rest bestimmt:

| Code | Was passiert |
|------|--------------|
| bekannt | Angaben kommen aus dem Artikelstamm und das Schild liegt **sofort** auf dem Blatt |
| unbekannt | beim Ablegen wird ein Artikel angelegt (`legeSchildArtikelAn()`) |
| keiner | reines Schild – Aktionsstapel, Dienstleistung, Restposten; Namenssuche hilft |

- **Warum überhaupt anlegen.** Vorher entstand hier für neue Ware ein Zettel
  und sonst nichts: dieselben Angaben mussten danach im Artikelformular ein
  zweites Mal getippt werden, und bis dahin ließ sich die Ware weder scannen
  noch verkaufen. Dieselbe Haltung wie an der Kasse und im Wareneingang – wer
  Ware in der Hand hat, erfasst sie einmal.
- **Angelegt wird über `createQuickProduct()`**, die Anlegefunktion der Kasse:
  Artikelnummer aus dem Nummernkreis der Warengruppe, Barcode auf
  Doppelvergabe geprüft, Preisstaffel ab 1 Stück. Eine zweite Anlegeroutine
  liefe über kurz oder lang auseinander, und ein Artikel ohne Staffel hätte im
  Shop keinen Preis.
- **Ohne Großhandelspreis gilt der Ladenpreis auch als Staffelpreis.** Die
  Alternative wäre eine Staffel über 0,00 €: der Artikel stünde im Shop zum
  Nulltarif, und das fiele erst bei der ersten Bestellung auf. Ein vorläufig
  zu hoher Preis lässt sich nachziehen, eine Nullbestellung nicht
  zurückholen.
- **Nachgeschlagen wird von selbst**, 450 ms nach der letzten Eingabe und ab
  sechs Zeichen (`findPreisschildArtikel()`, Barcode vor Artikelnummer wie an
  der Kasse). Ein Abgleich, den man von Hand auslösen muss, ist genau das,
  was er nicht sein soll. Die Hintergrundabfrage bleibt stumm; Enter im
  Scannerfeld und das Verlassen des Feldes melden sich mit Ton und
  Statusleiste – sonst piepte beim Tippen einer 13-stelligen Nummer jede
  Tippause einmal „unbekannt".
- **Ein Scan, ein Schild.** Enter im Scannerfeld schickt das Formular ab;
  `uebernehmen()` schlägt den Code selbst nach und legt in einem Zug ab.
  Vorher brauchte es zwei Enter je Artikel – eines zum Nachsehen, eines zum
  Ablegen –, und bei einem Regal voll Ware ist das ein Tastendruck zu viel
  pro Artikel. Der alte Abbruch sollte verhindern, dass ein ungeprüfter Preis
  gedruckt wird; dieser Schutz wandert von „vor dem Ablegen" nach „vor dem
  Drucken": das Blatt ist die Liste, jedes Schild steht dort in
  Originalmaßen, ein Klick holt es zurück, gedruckt wird erst auf Knopfdruck.
- **Der Fokus kehrt nach jeder Aktion zurück, die ein Scan ausgelöst hat –
  aber nur dorthin.** `zurueckZumFeld()` zielt standardmäßig aufs Scannerfeld,
  weil ein Handscanner meldet sich wie eine Tastatur: was er sendet, landet
  im gerade fokussierten Feld, nicht zwingend im Scannerfeld. Jede Stelle, die
  nach einem Scan **woanders** hinfokussiert (etwa die Namenssuche, die „weiter
  zum Preis" springt, wenn ein Treffer die nächste Frage „stimmt er noch?"
  aufwirft), darf das nur tun, wenn gerade **kein** Scan im Gang war – sonst
  tippt der nächste physische Scan seine Ziffern ins falsche Feld und ein
  Enter reißt mitten in der Eingabe das halbfertige Schild los. Genau das
  brach einmal, als die Namenssuche auch bei unbekanntem Code aktiviert wurde:
  der Fokus sprang weiter ins Preisfeld, obwohl gerade am Scanner gestanden
  wurde, und der nächste Scan landete dort statt im Scannerfeld.
- **Abgelegt wird aus dem Rückgabewert des Abgleichs**, nicht aus dem
  Formularzustand: `setEntwurf()` ist innerhalb derselben Funktion noch nicht
  wirksam, und das Schild käme mit der alten, womöglich leeren Bezeichnung
  aufs Blatt. `alsEntwurf()` baut die Werte, `uebernehmeArtikel()` ist nur
  noch für die Anzeige zuständig.
- **Zweimal derselbe Code heißt „zwei Stück".** `legeAb()` erhöht die
  Stückzahl eines vorhandenen Eintrags mit derselben **Artikelnummer**, statt
  eine Zeile anzuhängen – sonst wären zweimal scannen zwei Zeilen, die sich
  getrennt bepreisen lassen, und das fiele erst auf dem Papier auf. Über die
  Nummer und nicht über die Bezeichnung: zwei frei getippte Schilder mit
  gleichem Wortlaut und verschiedenen Preisen sind zwei Schilder, und ein
  Schild ohne Nummer wird nie zusammengelegt.
- **Abgeglichen wird nur ein neues Schild.** Wer ein Schild nachträglich
  ändert, korrigiert Papier – daraus einen Artikel anzulegen wäre eine
  Nebenwirkung, mit der niemand rechnet. Gilt für **alle** Auslöser eines
  Abgleichs – Namenssuche, Hintergrundabfrage beim Tippen *und* das Verlassen
  des Barcode-Felds –, nicht nur für den Scan selbst: ein Code im Feld eines
  gerade bearbeiteten Schilds (`bearbeitet`) löst keinen Abgleich aus. Fehlte
  diese Grenze bei den letzten beiden, überschrieb ein Scan oder eine
  Korrektur im Barcode-Feld während der Bearbeitung lautlos Name, Preise und
  `productId` des bearbeiteten Schilds mit denen eines fremden Artikels –
  „Änderung übernehmen" schrieb den dann unter der ursprünglichen Kennung auf
  den Bogen, und das sah aus wie ein verschwundenes Schild.
- **Namenssuche im Bezeichnungsfeld**
  (`components/admin/preisschild-artikel-suche.tsx`,
  `sucheSchildArtikelNachName()` auf `getPreisschildArtikel()`): schwebende
  Trefferliste, Pfeiltasten, ab zwei Zeichen, 250 ms Ruhe. Für Ware ohne
  lesbares Etikett – sie steht trotzdem im Stamm, und Bezeichnung samt
  Preisen abzutippen ist genau die Doppelarbeit, die der Abgleich abschafft.
  **Bei leerem Scannerfeld oder bei einem Code, der sich schon als unbekannt
  herausgestellt hat** (`unbekannt`): steht ein Code noch nicht fertig
  abgeglichen im Feld, bleibt die Suche aus – ein Vorschlag wäre sonst eine
  Einladung, einen zweiten Artikel unter dem Code des ersten zu wählen, und
  neue Ware unter dem Datensatz einer alten ist der teuerste Fehler, den die
  Maske zulassen kann. Ohne Treffer erscheint nichts; das Feld ist in erster
  Linie ein Eingabefeld. Eine Auswahl setzt `aufgeloest`/`treffer` mit, sonst
  hielte `uebernehmen()` den Artikel für unbekannt und legte ihn ein zweites
  Mal an.
- **Ein unbekannter Code trägt den Treffer nach, statt einen zweiten Artikel
  zu bekommen.** Nicht jede Rechnung hat eine EAN (Alpalium keine, Iden
  schon) – ein Artikel ohne Barcode scannt sich beim nächsten Mal trotzdem
  nicht von selbst. Wählt die Namenssuche bei einem unbekannten Code einen
  Artikel **ohne** gepflegten Barcode, schreibt `updateProductField()` den
  gescannten Code auf diesen Artikel; der nächste Scan findet ihn direkt. Hat
  der gewählte Artikel schon einen anderen Barcode, bleibt der unangetastet –
  `uebernehmeArtikel()` setzt das Feld dann ohnehin auf dessen eigenen Code
  zurück, und einem Artikel die Nummer eines anderen unterzuschieben wäre der
  nächste teure Fehler.
- **Jeder neue Artikel bekommt eine Artikelnummer**, immer aus dem
  Nummernkreis der Warengruppe (`next_sku()`) und nie aus einem Feld. Die
  `sku` auf dem Schild liest `uebernehmen()` grundsätzlich aus dem Stamm.
- **Signale und Tastatur-Wächter** wie an der Kasse (`useKassenMeldung()`,
  `useScanFocus()`): Statusleiste über dem Feld, Ton je Vorgang. Der Wächter
  pausiert, solange eine Abfrage läuft – käme der zweite Scan mitten in die
  Antwort des ersten, stünden die Angaben des einen Artikels unter dem Code
  des anderen.
- **Preis und Großhandelspreis schreiben in den Artikel zurück, sobald ein
  Schild zu einem Artikel gehört** – dieselben
  `preisSynchronisieren()`/`ghSynchronisieren()` wie im Bestandsgenerator.
  Preis und Streichpreis werden als Paar geschrieben (`setzeAktionspreis()`),
  der Großhandelspreis einzeln – gleiche Begründung wie dort.
  **Maßgeblich ist `entwurf.productId`, nicht `gefunden`.** `gefunden` ist
  nach `bearbeiten()` immer `null` (das zurückgeholte Schild wird nicht noch
  einmal abgeglichen), aber genau dort soll eine Preiskorrektur ebenfalls
  zurückgeschrieben werden – wer ein abgelegtes Schild korrigiert, korrigiert
  meist auch den tatsächlichen Preis. `productId` ist deshalb ein eigenes Feld
  an `FreiesSchild`/`Entwurf`, das `alsEntwurf()` beim Treffer setzt und
  `bearbeiten()` beim Zurückholen erhält – anders als `sku` (Text fürs Papier,
  frei änderbar) bleibt es die verlässliche Kennung für den Rückschreibpfad.
  `bearbeiten()` setzt `basisPreis`/`basisGh` dabei auf den Stand **des
  Schilds**, nicht auf den eines früheren, womöglich ganz anderen Treffers.
  Abgesehen davon und vom nachgetragenen Barcode (siehe oben) ändert sich am
  Artikel nichts.

---

## ▮▯ Strichcode auf dem Preisschild

`lib/barcode.ts`. EAN-13, EAN-8 und UPC-A, gezeichnet als Modulfolge und
nicht als Bild.

- **Eigener Encoder, keine Bibliothek.** Die Schilder entstehen an zwei
  Stellen – Druckbogen auf dem Server, Vorschau im Browser –, eine Bibliothek
  müsste in beide Bündel. Drei Symbologien sind drei Tabellen à zehn Zeilen.
  Die Ausgabe ist gegen die Decoder aus `@zxing/library` geprüft, und zwar
  bis zurück aus dem gerenderten DOM: die gemessenen Strichbreiten ergeben
  wieder dieselbe Nummer.
- **In der Fußzeile, rechts neben der Artikelnummer** – kein eigener Block
  unter dem Schild. Ein vierter Streifen kostete Höhe, die der Preis besser
  braucht, und machte aus einem ruhigen Schild ein volles. Die Striche sind
  so hoch wie die Artikelnummer daneben; ein Handscanner liest auch einen
  niedrigen Code, solange er gerade draufhält.
- **Auf farbigem Grund liegt er auf Weiß** (`barcodeKasten()`), auf weißem
  Schild gar nicht. Die Striche direkt aufs rote Aktionsschild zu setzen ist
  in der Praxis durchgefallen: die Handscanner im Laden lesen sie dort nicht.
  Die Theorie – rotes Laserlicht sieht Rot wie Weiß – hilft nicht, wenn das
  Gerät ein Kamerascanner ist, und die rund 4:1 Helligkeitsunterschied zu
  Schwarz reichen ihm nicht. Der Rand wird auf beiden Schildarten reserviert,
  damit rote und weiße Schilder desselben Bogens gleich aufgebaut sind.
- **Der Rand liegt außen** um die Striche. Ein Innenabstand würde bei
  `box-sizing: border-box` vom Platz der Striche abgezogen, und der Code käme
  gestaucht aus dem Drucker.
- **Module statt Bild.** Wie breit ein Modul auf dem Papier wird, entscheidet
  erst das Schild (`barcodeMasse()`), nach oben begrenzt aufs Nennmaß
  `MODUL_NENN` (0,33 mm). Ein fertiges PNG müsste skaliert werden, und ein auf
  krumme Faktoren skalierter Strichcode ist genau das, was Scanner nicht mehr
  lesen. Unter `MODUL_MIN` (0,26 mm) warnt die Werkbank – gedruckt wird
  trotzdem; unter `MODUL_HART` (0,16 mm) gar nicht mehr, dort verschmelzen
  benachbarte Striche schon im Druckbild.
- **Ruhezonen gehören zum Code**, nicht zum Rand: sie stecken als helle
  Module in `Barcode.breite` und sind damit Teil der weißen Fläche.
- **Breitenaufteilung der Fußzeile**: das Label behält sein Maß, der
  Strichcode nimmt sich davon höchstens `BARCODE_ANTEIL` (55 %) und nie so
  viel, dass der Artikelnummer weniger als `KENNUNG_ANTEIL` (28 %) bleibt.
  Die Zelle schneidet Überstehendes ab, und eine abgeschnittene Artikelnummer
  ist eine falsche Artikelnummer. Ein breites Label („TOPSELLER") lässt
  deshalb auf kleinen Formaten keinen Code übrig – dann steht keiner da.
- **`labelBreite()` und `kennungSchriftgroesse()` schätzen absichtlich nach
  oben** (0,72 bzw. 0,58 em je Zeichen). Beide Schätzungen entscheiden, wie
  groß die Artikelnummer gesetzt wird; liegen sie zu niedrig, steht am Regal
  „110002#120" statt „110002#1200".
- **Falsche Prüfziffer wird nicht berichtigt**, sondern der Code weggelassen:
  sonst stünde eine andere Nummer auf dem Schild als im Artikelstamm. Eine
  ganz fehlende Prüfziffer (12 bzw. 7 Ziffern) wird ergänzt – das ist keine
  Änderung, sondern dieselbe Nummer vollständig.
- **Klartext-Rückfall nur bei einer Nummer, die kein EAN ist** – und zwar in
  Bogen *und* Vorschau über `fuss.klartext`. Beide prüften vorher selbst
  („kein Code gezeichnet") und hängten die dreizehn Ziffern auch dann an, wenn
  der Code nur aus Platzmangel fehlte: auf 25 mm Breite schnitt das die
  Artikelnummer ab. Wurde der Code
  bloß aus Platzmangel weggelassen, hilft die Ziffernfolge niemandem: sie ist
  dreizehnstellig und stünde in der Restbreite in Ameisengröße da.
- **Platz kommt notfalls vom Preis.** `schildMasse(format, { barcode: true })`
  nimmt den Preisblock schrittweise zurück, bis `hoehenBedarf()` wieder in die
  Schildhöhe passt. In der Praxis greift das nicht mehr, seit der Code in der
  Fußzeile steht – die Bremse bleibt für frei eingegebene Maße.
- **Kein Code 128.** Die Ware im Laden trägt EAN; eine 107-Zeilen-Tabelle,
  die niemand nachrechnet, wäre ein Risiko für den einen Artikel mit
  Buchstaben im Feld. Was kein EAN ist, steht wie bisher als Ziffernfolge
  hinter der Artikelnummer (`schildKennung()`).

---

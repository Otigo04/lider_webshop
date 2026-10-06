# Kataloge

Ausgelagert aus `CLAUDE.md`. Die Regeln, die dort stehen, gelten weiter;
hier steht das Warum und das Wie.

---

## 📖 Kataloge

`/admin/kataloge`, Grundlage `supabase/migrations/051_kataloge.sql`. Artikel
zu einem Katalog zusammenstellen – Gesamtsortiment oder Aktionsheft – und als
A4-Dokument drucken oder über den Druckdialog als PDF sichern.

- **Gespeichert wird nur Auswahl und Einstellung** (`catalogs`,
  `catalog_items`), nie Preis, Bezeichnung oder Foto. Jede Ausgabe liest
  frisch aus dem Artikelstamm – dieselbe Regel wie beim Preisschild. Die
  Zusammenstellung von diesem Monat ergibt nächsten Monat den Katalog mit den
  Preisen von nächstem Monat.
- **`lib/katalog.ts` ist die eine Stelle, die entscheidet**, was gedruckt wird,
  zu welchem Preis und auf welcher Seite (`katalogAufbau()`). Werkbank und
  Bogen rufen beide dieselbe Funktion; die Datei importiert deshalb nichts,
  was nur auf dem Server läuft. Zwei Rechenwege wären eine Seitenzahl in der
  Werkbank, die nicht zum Papier passt. Geprüft über
  `node --experimental-strip-types scripts/katalog-check.mjs`.
- **Der Bogen ist ein Route Handler** (`/admin/kataloge/[id]/druck`,
  `lib/katalog-bogen.ts`), HTML plus Druckdialog wie Kassenbon und
  Preisschild-Bogen. **GET**, weil die Auswahl in der Datenbank steht;
  `?druck=0` ist die Vorschau. pdf-lib wurde verworfen: drei Raster mal zwei
  Stile wären sechs handgesetzte Layouts, und WebP-Fotos gingen nicht.
- **Umbruch in Einheiten, feste Höhen, geklemmter Text.** Eine Seite hat 24
  Einheiten (Liste 40), eine Kachel 6, eine große Zelle 8, eine Listenzeile 2
  (`RASTER`). Nur weil nichts mit seinem Inhalt wächst, ist der Umbruch
  rechenbar, bevor ein Browser gesetzt hat – und nur dann stimmen die
  Seitenzahlen im Inhaltsverzeichnis. Der Bogen setzt jeden Block mit
  `grid-row`/`grid-column` genau dorthin, wo `katalogAufbau()` ihn hingelegt
  hat, und trifft selbst keine Umbruchentscheidung.
- **Jede Zelle ist gleich aufgebaut**: eine leere Angabe (keine Merkmale,
  keine Beschreibung) lässt ihren Platz frei. Rückte der Rest nach, stünden
  die Preise einer Zeile auf verschiedenen Höhen.
- **Drei Preisarten**: Großhandel (netto, Staffeln), Ladenpreis, ohne Preise.
  **Bei „Ladenpreis" kein Rückfall auf die Staffel** – anders als an der
  Kasse. Ein Großhandelspreis unter „inkl. USt." stünde auf Papier, das sich
  nicht zurückholen lässt. Reduzierung nur über `reduzierung()`.
- **Der Einkaufspreis wird gar nicht geladen** (`lib/queries/kataloge.ts`).
  Was nicht im Browser ankommt, kann nicht versehentlich gedruckt werden.
- **Was fehlt, fehlt sichtbar**: ohne Foto oder ohne Preis der gewählten
  Preisart steht ein Artikel nicht im Katalog; die Werkbank zählt beides in
  einer anklickbaren Leiste und markiert die Zeile. Ausverkauft und im Shop
  ausgeblendet sind nur Hinweise – der Katalog gilt Wochen, der Lagerstand
  Stunden, und der Bestand wird nicht gedruckt.
- **Ausführungen falten zu einem Angebot** über die volle Breite (Foto links,
  Tabelle rechts) – aber nur die Mitglieder, die im Katalog stehen. Beim Foto
  gilt die Gruppe: eine Ausführung ohne eigenes Bild bleibt, solange eine
  andere eins hat. Steht die Rasterzeile vor dem Angebot erst halb voll, wird
  sie mit den folgenden Einzelartikeln aufgefüllt, sonst bliebe ein Loch. Ein
  Angebot, höher als eine Seite, wird zwischen zwei Ausführungen geteilt.
- **Warengruppe hinzufügen schreibt Einzelzeilen**, keine Verknüpfung
  „Katalog enthält Gruppe". Der Katalog soll nicht ungefragt wachsen, wenn am
  Tag vor dem Druck jemand drei Artikel anlegt; „Gruppe auffüllen" holt sie
  ausdrücklich nach.
- **Zwei Stile, gleiche Maße**: „sachlich" und „Prospekt" unterscheiden sich
  nur in Farbe und Gewicht. Bekäme der Katalog beim Umschalten eine andere
  Seitenzahl, wäre er nicht mehr dasselbe Dokument. Für beide gilt: keine
  Verläufe, Schatten, Rundungen, Symbole; Maße in mm und pt.
- **Inhaltsverzeichnis erst ab acht Seiten** (`INHALT_AB_SEITEN`), sonst wäre
  es eine Seite Papier für drei Zeilen.
- **Fotos über den Bildoptimierer** (`/_next/image`, Breite je Raster), nicht
  als Original: dreihundert Originale ergäben ein PDF, das sich nicht
  verschicken lässt. Das Original reist als `data-roh` mit und wird
  nachgeladen, falls der Optimierer die Adresse ablehnt. Der Druckdialog
  öffnet erst, wenn alle Bilder da sind, spätestens nach 15 Sekunden.
- **Strichcode als ein SVG-Pfad** je Code (`lib/barcode.ts`), immer schwarz
  auf Weiß; unter `MODUL_MIN` oder bei ungültiger Nummer steht keiner.
- **Kein Speichern-Knopf in der Werkbank**: jede Änderung geht sofort als
  Action hinaus (`lib/actions/kataloge.ts`, je Feld ein Zod-Schema) und wird
  zurückgenommen, wenn sie scheitert. Textfelder speichern beim Verlassen.
- Abfragen blättern über die 1000-Zeilen-Grenze von PostgREST hinaus.

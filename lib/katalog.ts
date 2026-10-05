import { reduzierung, type Reduzierung } from "@/lib/pricing";

/**
 * Kataloge (Migration 051) – die Regeln ohne Datenbank und ohne DOM.
 *
 * Hier wird entschieden, was gedruckt wird, zu welchem Preis und auf welcher
 * Seite. Die Werkbank (Browser) und der Bogen (Route Handler) rufen beide
 * dieselben Funktionen: zwei Rechenwege wären eine Seitenzahl in der Werkbank,
 * die nicht zum Papier passt, und ein Inhaltsverzeichnis, das danebenliegt.
 *
 * Deshalb darf diese Datei nichts importieren, was nur auf dem Server läuft.
 */

export type KatalogLayout = "liste" | "kacheln" | "gross";
export type KatalogStil = "sachlich" | "prospekt";
export type KatalogPreisart = "grosshandel" | "laden" | "ohne";

export const LAYOUT_NAMEN: Record<KatalogLayout, string> = {
  liste: "Liste",
  kacheln: "Kacheln 3 × 4",
  gross: "Groß 2 × 3",
};

export const STIL_NAMEN: Record<KatalogStil, string> = {
  sachlich: "Sachlich",
  prospekt: "Prospekt",
};

export const PREISART_NAMEN: Record<KatalogPreisart, string> = {
  grosshandel: "Großhandel (netto, Staffeln)",
  laden: "Ladenpreis",
  ohne: "Ohne Preise",
};

export interface KatalogEinstellungen {
  title: string;
  /** Zeitraum oder Zusatz unter dem Titel – „Oktober 2026" */
  subtitle: string | null;
  layout: KatalogLayout;
  stil: KatalogStil;
  preisart: KatalogPreisart;
  zeigeBarcode: boolean;
  zeigeBeschreibung: boolean;
  zeigeMerkmale: boolean;
  zeigeKennzeichen: boolean;
  mitTitelseite: boolean;
  mitInhalt: boolean;
  /** Jede Warengruppe beginnt auf einer neuen Seite */
  mitTrennseiten: boolean;
  mitRueckseite: boolean;
  rueckseiteText: string | null;
}

export const KATALOG_VORGABE: KatalogEinstellungen = {
  title: "Neuer Katalog",
  subtitle: null,
  layout: "kacheln",
  stil: "sachlich",
  preisart: "grosshandel",
  zeigeBarcode: true,
  zeigeBeschreibung: false,
  zeigeMerkmale: true,
  zeigeKennzeichen: true,
  mitTitelseite: true,
  mitInhalt: true,
  mitTrennseiten: true,
  mitRueckseite: true,
  rueckseiteText: null,
};

export interface KatalogStaffel {
  /** Mindestmenge der Staffel */
  ab: number;
  preis: number;
}

/**
 * Ein Artikel, so wie Werkbank und Bogen ihn brauchen.
 *
 * Kein Einkaufspreis: die Abfrage lädt ihn gar nicht erst. Was nicht im
 * Browser ankommt, kann auch nicht versehentlich gedruckt werden.
 */
export interface KatalogArtikel {
  id: string;
  sku: string;
  name: string;
  beschreibung: string | null;
  barcode: string | null;
  kategorieId: string;
  kategorie: string;
  /** Für die Akzentfarbe im Prospekt-Stil (accentIndex) */
  kategorieSlug: string;
  /** categories.order_index – Reihenfolge der Abschnitte */
  kategorieRang: number;
  gruppeId: string | null;
  gruppeName: string | null;
  /** Aufsteigend nach Mindestmenge, nur Preise über 0 */
  staffeln: KatalogStaffel[];
  /** Ladenpreis, null = nicht gepflegt */
  laden: number | null;
  /** Streichpreis (products.list_price) */
  vorher: number | null;
  /** Frei verfügbar */
  bestand: number;
  aktiv: boolean;
  neu: boolean;
  topseller: boolean;
  bildUrl: string | null;
  merkmale: { merkmal: string; wert: string }[];
}

// --- Preis -------------------------------------------------------------------

export interface KatalogPreis {
  /** Der Preis, der groß dasteht */
  preis: number;
  /** Mindestmenge dazu; 1 heißt „ohne Mengenangabe" */
  ab: number;
  /** Alle Staffeln (Großhandel) oder leer (Laden) */
  staffeln: KatalogStaffel[];
  reduziert: Reduzierung | null;
}

/**
 * Preis eines Artikels in der gewählten Preisart. null = nicht druckbar
 * (bzw. bei „ohne": es gibt schlicht keinen).
 *
 * **Kein Rückfall von „laden" auf die Staffel** – anders als an der Kasse
 * (counterUnitPrice()). Dort ist der falsche Kanal besser als ein Artikel,
 * der sich nicht buchen lässt. Hier stünde ein Großhandelspreis unter der
 * Überschrift „inkl. USt." auf Papier, das sich nicht zurückholen lässt.
 */
export function katalogPreis(
  artikel: KatalogArtikel,
  preisart: KatalogPreisart,
): KatalogPreis | null {
  if (preisart === "ohne") return null;

  if (preisart === "laden") {
    if (artikel.laden === null || !(artikel.laden > 0)) return null;
    return {
      preis: artikel.laden,
      ab: 1,
      staffeln: [],
      reduziert: reduzierung(artikel.vorher, artikel.laden, artikel.laden),
    };
  }

  const erste = artikel.staffeln[0];
  if (!erste) return null;
  return {
    preis: erste.preis,
    ab: erste.ab,
    staffeln: artikel.staffeln,
    // Der Vorher-Preis ist ein Ladenpreis; der Prozentsatz wird auf die
    // Staffel übertragen – dieselbe Regel wie im Shop.
    reduziert: reduzierung(artikel.vorher, erste.preis, artikel.laden),
  };
}

/**
 * Höchstens drei Staffeln für die Listenzeile: die kleinste Menge, die
 * nächste und der beste Preis. Die mittleren fallen weg – wer bei vier
 * Staffeln eine weglässt, lässt am besten die weg, die weder den Einstieg
 * noch das Ziel beschreibt.
 */
export function listenStaffeln<T>(staffeln: T[]): T[] {
  if (staffeln.length <= 3) return staffeln;
  return [staffeln[0], staffeln[1], staffeln[staffeln.length - 1]];
}

// --- Maße --------------------------------------------------------------------

/** A4 hoch, in Millimetern. */
export const SEITE = { breite: 210, hoehe: 297 } as const;

/** Seitenrand. So nah kommt jeder Bürodrucker an die Kante. */
export const RAND = 12;

/** Kopf- und Fußzeile der Artikelseiten samt Abstand zur Nutzfläche. */
export const KOPF = { hoehe: 11, abstand: 3 } as const;
export const FUSS = { hoehe: 6, abstand: 3 } as const;

export const NUTZ = {
  breite: SEITE.breite - 2 * RAND,
  hoehe:
    SEITE.hoehe -
    2 * RAND -
    KOPF.hoehe -
    KOPF.abstand -
    FUSS.hoehe -
    FUSS.abstand,
} as const;

/**
 * Das Raster je Layout, in **Einheiten** statt in ganzen Zeilen.
 *
 * Eine Seite ist in gleich hohe Einheiten geteilt; ein Artikel belegt mehrere
 * davon. Der feinere Maßstab ist für alles da, was keine ganze Artikelzeile
 * braucht: eine Zwischenüberschrift kostete als ganze Zeile bei den Kacheln
 * gut sechs Zentimeter weißes Papier.
 *
 * Feste Höhen und geklemmter Text statt Zellen, die mit ihrem Inhalt wachsen:
 * nur so ist der Umbruch rechenbar, bevor irgendein Browser gesetzt hat – und
 * nur dann stimmen die Seitenzahlen im Inhaltsverzeichnis.
 */
export interface Raster {
  spalten: number;
  /** Einheiten je Seite */
  einheiten: number;
  /** Höhe eines Artikels in Einheiten */
  artikel: number;
  /** Höhe einer Zwischenüberschrift */
  ueberschrift: number;
}

export const RASTER: Record<KatalogLayout, Raster> = {
  liste: { spalten: 1, einheiten: 40, artikel: 2, ueberschrift: 2 },
  kacheln: { spalten: 3, einheiten: 24, artikel: 6, ueberschrift: 1 },
  gross: { spalten: 2, einheiten: 24, artikel: 8, ueberschrift: 1 },
};

/** Höhe einer Einheit in Millimetern. */
export function einheitMm(layout: KatalogLayout): number {
  return NUTZ.hoehe / RASTER[layout].einheiten;
}

/** Kopf eines Ausführungs-Angebots (Titel) in Kacheln und Groß, in mm. */
export const ANGEBOT_KOPF_MM = 11;

/**
 * Zeilenhöhe einer Ausführung in Kacheln und Groß. Mit Strichcode höher: ein
 * Code, der in eine 5-mm-Zeile gequetscht wird, ist keiner mehr.
 */
export function ausfuehrungMm(mitBarcode: boolean): number {
  return mitBarcode ? 8.5 : 5.2;
}

/** Innenabstand eines Angebots oben und unten zusammen, in mm. */
export const ANGEBOT_RAND_MM = 3;

/** Ein Angebot ist nie flacher als das – sonst hätte das Foto keinen Platz. */
const ANGEBOT_MIN_MM = 38;

/**
 * Höhe eines Angebots mit `n` Ausführungen, in Einheiten.
 *
 * In der Liste eine Kopfzeile wie jeder Artikel und darunter je Ausführung
 * eine halbe Artikelzeile (mit Strichcode eine ganze). In den Rastern aus
 * Millimetern gerechnet und auf ganze Einheiten aufgerundet.
 */
export function angebotEinheiten(
  layout: KatalogLayout,
  n: number,
  mitBarcode: boolean,
): number {
  const raster = RASTER[layout];
  if (layout === "liste") {
    return raster.artikel + n * (mitBarcode ? 2 : 1);
  }
  const bedarf = Math.max(
    ANGEBOT_MIN_MM,
    // Titel, Tabellenkopf und je Ausführung eine Zeile, dazu der Rand –
    // fehlte er in der Rechnung, schnitte die Zelle die letzte Zeile ab.
    ANGEBOT_RAND_MM + ANGEBOT_KOPF_MM + (n + 1) * ausfuehrungMm(mitBarcode),
  );
  return Math.ceil(bedarf / einheitMm(layout));
}

/** Wie viele Ausführungen in `einheiten` passen – Umkehrung von oben. */
function ausfuehrungenIn(
  layout: KatalogLayout,
  einheiten: number,
  mitBarcode: boolean,
): number {
  let n = 0;
  while (angebotEinheiten(layout, n + 1, mitBarcode) <= einheiten) n++;
  return n;
}

// --- Aufbau ------------------------------------------------------------------

export interface ArtikelBlock {
  art: "artikel";
  artikel: KatalogArtikel;
  /** Erste Einheit, ab 0 */
  zeile: number;
  hoehe: number;
  /** Spalte, ab 0 */
  spalte: number;
}

export interface AngebotBlock {
  art: "angebot";
  titel: string;
  bildUrl: string | null;
  beschreibung: string | null;
  ausfuehrungen: KatalogArtikel[];
  /** Zweiter Teil eines Angebots, das über die Seitengrenze ging */
  fortsetzung: boolean;
  zeile: number;
  hoehe: number;
}

export interface UeberschriftBlock {
  art: "ueberschrift";
  kategorie: string;
  kategorieSlug: string;
  zeile: number;
  hoehe: number;
}

export type KatalogBlock = ArtikelBlock | AngebotBlock | UeberschriftBlock;

export interface KatalogSeite {
  /** Seitenzahl im fertigen Dokument, Titelseite = 1 */
  nummer: number;
  /** Warengruppe, mit der die Seite beginnt – steht in der Kopfzeile */
  kategorie: string;
  kategorieSlug: string;
  bloecke: KatalogBlock[];
}

export interface KatalogAufbau {
  seiten: KatalogSeite[];
  /** Inhaltsverzeichnis; null, wenn es entfällt */
  inhalt: { kategorie: string; seite: number }[] | null;
  /** Alle Seiten: Titel, Inhalt, Artikelseiten, Rückseite */
  gesamtSeiten: number;
  /** Artikel, die tatsächlich im Katalog stehen (Ausführungen einzeln gezählt) */
  gedruckt: number;
  /** Kennungen der Artikel, die fehlen, weil sie kein Foto haben */
  ohneFoto: string[];
  /** … und derer, denen der Preis der gewählten Preisart fehlt */
  ohnePreis: string[];
}

/**
 * Unter so vielen Seiten gibt es kein Inhaltsverzeichnis: für ein Heft von
 * vier Seiten eines zu drucken wäre eine Seite Papier für drei Zeilen.
 */
export const INHALT_AB_SEITEN = 8;

/**
 * Bringt die Auswahl in Druckreihenfolge: Warengruppen nach ihrem Rang,
 * darin die Reihenfolge, in der die Artikel hereinkommen.
 *
 * `sort()` ist stabil – die Reihenfolge innerhalb einer Warengruppe ist die
 * der Zusammenstellung und bleibt unangetastet.
 */
export function sortiere(artikel: KatalogArtikel[]): KatalogArtikel[] {
  return [...artikel].sort(
    (a, b) =>
      a.kategorieRang - b.kategorieRang ||
      a.kategorie.localeCompare(b.kategorie, "de") ||
      a.kategorieId.localeCompare(b.kategorieId),
  );
}

type Eintrag =
  | { art: "artikel"; artikel: KatalogArtikel }
  | {
      art: "angebot";
      titel: string;
      bildUrl: string | null;
      beschreibung: string | null;
      ausfuehrungen: KatalogArtikel[];
    };

interface Abschnitt {
  kategorie: string;
  kategorieSlug: string;
  eintraege: Eintrag[];
}

/**
 * Sortiert aus, was nicht gedruckt wird, und faltet Ausführungen desselben
 * Angebots zu einem Eintrag.
 *
 * Gefaltet wird nur, was im Katalog steht: wer aus vier Ausführungen zwei
 * auswählt, bekommt ein Angebot mit zwei Zeilen. Ein einzelnes Mitglied steht
 * als gewöhnlicher Artikel da.
 *
 * Beim Foto gilt für ein Angebot die Gruppe, nicht das Mitglied: gezeigt wird
 * ohnehin nur ein Bild, also darf eine Ausführung ohne eigenes Foto bleiben,
 * solange eine andere eins hat.
 */
function baueAbschnitte(
  artikel: KatalogArtikel[],
  preisart: KatalogPreisart,
): { abschnitte: Abschnitt[]; ohneFoto: string[]; ohnePreis: string[] } {
  const ohneFoto: string[] = [];
  const ohnePreis: string[] = [];
  const abschnitte: Abschnitt[] = [];

  let i = 0;
  const sortiert = sortiere(artikel);
  while (i < sortiert.length) {
    const kategorieId = sortiert[i].kategorieId;
    const mitglieder: KatalogArtikel[] = [];
    while (i < sortiert.length && sortiert[i].kategorieId === kategorieId) {
      mitglieder.push(sortiert[i]);
      i++;
    }

    const mitPreis = mitglieder.filter((a) => {
      if (preisart === "ohne" || katalogPreis(a, preisart) !== null) return true;
      ohnePreis.push(a.id);
      return false;
    });

    const jeGruppe = new Map<string, KatalogArtikel[]>();
    for (const a of mitPreis) {
      if (!a.gruppeId) continue;
      jeGruppe.set(a.gruppeId, [...(jeGruppe.get(a.gruppeId) ?? []), a]);
    }

    const gesehen = new Set<string>();
    const eintraege: Eintrag[] = [];

    for (const a of mitPreis) {
      const gruppe = a.gruppeId ? (jeGruppe.get(a.gruppeId) ?? []) : [];

      if (gruppe.length >= 2) {
        if (gesehen.has(a.gruppeId!)) continue;
        gesehen.add(a.gruppeId!);

        const bild = gruppe.find((g) => g.bildUrl)?.bildUrl ?? null;
        if (!bild) {
          ohneFoto.push(...gruppe.map((g) => g.id));
          continue;
        }
        eintraege.push({
          art: "angebot",
          titel: a.gruppeName?.trim() || a.name,
          bildUrl: bild,
          beschreibung: gruppe.find((g) => g.beschreibung)?.beschreibung ?? null,
          ausfuehrungen: gruppe,
        });
        continue;
      }

      if (!a.bildUrl) {
        ohneFoto.push(a.id);
        continue;
      }
      eintraege.push({ art: "artikel", artikel: a });
    }

    if (eintraege.length > 0) {
      abschnitte.push({
        kategorie: mitglieder[0].kategorie,
        kategorieSlug: mitglieder[0].kategorieSlug,
        eintraege,
      });
    }
  }

  return { abschnitte, ohneFoto, ohnePreis };
}

/**
 * Verteilt die Einträge auf Seiten.
 *
 * Einzelartikel füllen das Raster von links nach rechts. Ein Angebot braucht
 * die volle Breite: steht die laufende Rasterzeile erst halb voll, wartet es,
 * bis die nachfolgenden Einzelartikel sie aufgefüllt haben – sonst bliebe
 * mitten auf der Seite ein Loch, das wie ein fehlender Artikel aussieht. Die
 * Reihenfolge verschiebt sich dadurch um höchstens eine Zeile.
 */
function verteile(
  abschnitte: Abschnitt[],
  e: KatalogEinstellungen,
): { seiten: Omit<KatalogSeite, "nummer">[]; beginn: Map<string, number> } {
  const raster = RASTER[e.layout];
  const seiten: Omit<KatalogSeite, "nummer">[] = [];
  /** Warengruppe → Index der Seite, auf der sie beginnt */
  const beginn = new Map<string, number>();

  // `as` statt Typannotation: sonst hält der Compiler die Variable hinter den
  // Closures für dauerhaft null.
  let seite = null as Omit<KatalogSeite, "nummer"> | null;
  let zeile = 0;
  let spalte = 0;

  const neueSeite = (abschnitt: Abschnitt) => {
    seite = {
      kategorie: abschnitt.kategorie,
      kategorieSlug: abschnitt.kategorieSlug,
      bloecke: [],
    };
    seiten.push(seite);
    zeile = 0;
    spalte = 0;
  };

  for (const abschnitt of abschnitte) {
    const frei = () => raster.einheiten - zeile;

    const setzeAngebot = (angebot: Extract<Eintrag, { art: "angebot" }>) => {
      let rest = angebot.ausfuehrungen;
      let fortsetzung = false;

      while (rest.length > 0) {
        let hoehe = angebotEinheiten(e.layout, rest.length, e.zeigeBarcode);
        let teil = rest;

        if (hoehe > frei()) {
          if (hoehe <= raster.einheiten) {
            // Passt als Ganzes auf eine Seite, nur nicht mehr auf diese.
            neueSeite(abschnitt);
          } else {
            // Höher als eine ganze Seite: zwischen zwei Ausführungen teilen.
            let platz = ausfuehrungenIn(e.layout, frei(), e.zeigeBarcode);
            if (platz < 2) {
              neueSeite(abschnitt);
              platz = ausfuehrungenIn(e.layout, frei(), e.zeigeBarcode);
            }
            teil = rest.slice(0, Math.max(1, platz));
            hoehe = angebotEinheiten(e.layout, teil.length, e.zeigeBarcode);
          }
        }

        seite!.bloecke.push({
          art: "angebot",
          titel: angebot.titel,
          bildUrl: angebot.bildUrl,
          beschreibung: angebot.beschreibung,
          ausfuehrungen: teil,
          fortsetzung,
          zeile,
          hoehe,
        });
        zeile += hoehe;
        rest = rest.slice(teil.length);
        fortsetzung = true;
      }
    };

    const wartend: Extract<Eintrag, { art: "angebot" }>[] = [];
    const zeileSchliessen = () => {
      if (spalte !== 0) {
        zeile += raster.artikel;
        spalte = 0;
      }
      while (wartend.length > 0) setzeAngebot(wartend.shift()!);
    };

    // --- Beginn der Warengruppe ---------------------------------------------
    const erster = abschnitt.eintraege[0];
    const ersteHoehe =
      erster.art === "angebot"
        ? Math.min(
            angebotEinheiten(
              e.layout,
              erster.ausfuehrungen.length,
              e.zeigeBarcode,
            ),
            raster.einheiten,
          )
        : raster.artikel;

    if (seite === null || e.mitTrennseiten) {
      neueSeite(abschnitt);
    } else if (raster.ueberschrift + ersteHoehe > frei()) {
      // Eine Überschrift, unter der nichts mehr steht, gehört auf die
      // nächste Seite – und dort steht sie schon in der Kopfzeile.
      neueSeite(abschnitt);
    } else if (zeile > 0) {
      seite!.bloecke.push({
        art: "ueberschrift",
        kategorie: abschnitt.kategorie,
        kategorieSlug: abschnitt.kategorieSlug,
        zeile,
        hoehe: raster.ueberschrift,
      });
      zeile += raster.ueberschrift;
    }
    beginn.set(abschnitt.kategorie, seiten.length - 1);

    // --- Einträge -----------------------------------------------------------
    for (const eintrag of abschnitt.eintraege) {
      if (eintrag.art === "angebot") {
        if (spalte === 0) setzeAngebot(eintrag);
        else wartend.push(eintrag);
        continue;
      }

      if (spalte === 0 && raster.artikel > frei()) neueSeite(abschnitt);

      seite!.bloecke.push({
        art: "artikel",
        artikel: eintrag.artikel,
        zeile,
        hoehe: raster.artikel,
        spalte,
      });
      spalte++;
      if (spalte === raster.spalten) zeileSchliessen();
    }
    zeileSchliessen();
  }

  return { seiten, beginn };
}

/**
 * Der ganze Katalog: was gedruckt wird, auf welcher Seite, und was fehlt.
 *
 * `artikel` kommt in der Reihenfolge der Zusammenstellung herein.
 */
export function katalogAufbau(
  artikel: KatalogArtikel[],
  e: KatalogEinstellungen,
): KatalogAufbau {
  const { abschnitte, ohneFoto, ohnePreis } = baueAbschnitte(artikel, e.preisart);
  const { seiten, beginn } = verteile(abschnitte, e);

  const davor = e.mitTitelseite ? 1 : 0;
  const danach = e.mitRueckseite && seiten.length > 0 ? 1 : 0;

  // Ob es ein Inhaltsverzeichnis gibt, hängt an der Seitenzahl – und die
  // Seitenzahl am Inhaltsverzeichnis. Gezählt wird deshalb so, als stünde es
  // schon drin.
  const mitInhalt =
    e.mitInhalt &&
    seiten.length > 0 &&
    davor + 1 + seiten.length + danach >= INHALT_AB_SEITEN;

  const versatz = davor + (mitInhalt ? 1 : 0);

  return {
    seiten: seiten.map((s, index) => ({ ...s, nummer: versatz + index + 1 })),
    inhalt: mitInhalt
      ? [...beginn].map(([kategorie, index]) => ({
          kategorie,
          seite: versatz + index + 1,
        }))
      : null,
    gesamtSeiten:
      seiten.length === 0 ? 0 : versatz + seiten.length + danach,
    gedruckt: abschnitte.reduce(
      (summe, a) =>
        summe +
        a.eintraege.reduce(
          (s, eintrag) =>
            s + (eintrag.art === "angebot" ? eintrag.ausfuehrungen.length : 1),
          0,
        ),
      0,
    ),
    ohneFoto,
    ohnePreis,
  };
}

/**
 * Bezeichnung einer Ausführung innerhalb ihres Angebots: die Merkmalswerte
 * („Rot · 60 W"). Ohne Merkmale der Artikelname – der Gruppentitel steht
 * darüber, und eine leere Zelle sagte gar nichts.
 */
export function ausfuehrungName(artikel: KatalogArtikel): string {
  const werte = artikel.merkmale.map((m) => m.wert);
  return werte.length > 0 ? werte.join(" · ") : artikel.name;
}

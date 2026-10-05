/**
 * Der getippte Schilderstapel des freien Generators – im Browser, nicht in
 * der Datenbank.
 *
 * Gespeichert wird bewusst nichts auf dem Server: ein Preisschild ist eine
 * Momentaufnahme (siehe CLAUDE.md), eine abgelegte Schilderliste wäre eine
 * zweite Wahrheit, die still veraltet. Ein von Hand getippter Stapel ist aber
 * zu teuer, um ihn an ein versehentliches Neuladen zu verlieren – anders als
 * beim Bestandsgenerator, wo zwei Klicks dieselbe Liste wiederherstellen.
 *
 * Als externer Store und nicht als `useState` plus Effekt, genau wie der
 * Warenkorb (`lib/cart-context.tsx`): `getServerSnapshot()` liefert leer, der
 * Browser liest beim ersten Abonnieren nach. Ein Nachladen im Effekt löste
 * eine zweite Renderrunde aus und wäre auf dem Server zudem ein
 * Hydrationsunterschied.
 */

/** Ein getipptes Schild. Ohne Artikelstamm, deshalb mit eigener Kennung. */
export interface FreiesSchild {
  /** Eigene Kennung – es gibt keine Artikelnummer, auf die man zeigen könnte. */
  id: string;
  name: string;
  preis: number;
  /** 0 = keine Reduzierung. */
  vorher: number;
  /** Großhandelspreis in Euro; 0 = kein verdeckter Code. */
  gh: number;
  /** Artikelnummer oder beliebiger Text für die Fußzeile; leer erlaubt. */
  sku: string;
  /** Barcode zum Scannen; leer = keiner. */
  barcode: string;
  iconId: string | null;
  labelKey: string | null;
  anzahl: number;
  /**
   * Der Artikel, aus dem dieses Schild entstand – null bei einem reinen
   * Schild ohne Artikelstamm. Anders als `sku` (Text fürs Papier, frei
   * änderbar) ist das die echte ID für den Rückschreibpfad: wird das Schild
   * später erneut geöffnet und der Preis geändert, muss klar sein, welcher
   * Artikel gemeint ist, auch wenn `sku` inzwischen von Hand geändert wurde.
   */
  productId: string | null;
}

export interface FreiStand {
  schilder: FreiesSchild[];
  /** Gewählte Schildgröße; null = noch keine Wahl, dann gilt die Vorgabe. */
  formatId: string | null;
  mitBarcode: boolean;
  /** false, bis der Speicher gelesen ist – verhindert Hydration-Mismatch. */
  ready: boolean;
}

const SPEICHER = "lider.preisschilder.frei.v1";

/**
 * Höchstzahl der Schilder auf einem Stapel – dieselbe Grenze wie im Druckbogen
 * (`MAX_SCHILDER` in app/admin/preisschilder/druck/route.ts).
 *
 * Sie muss hier gelten und nicht nur im Formular: aus dem Stapel baut die
 * Vorschau für jedes Schild ein eigenes Element samt Textmessung. Landete
 * einmal ein Barcode im Mengenfeld (Handscanner schreibt in das Feld, in dem
 * der Fokus steht), stand 186.837 im Speicher – und jeder Aufruf der Seite
 * fror ein, weil der Stapel beim Laden zurückkam.
 */
export const MAX_SCHILDER = 1000;

/**
 * Stückzahlen auf ganze Zahlen ab 1 bringen und die Summe deckeln.
 *
 * Gekürzt wird der Reihe nach: wer die Grenze reißt, verliert seine
 * Überzahl, nicht der Eintrag davor. Jeder Eintrag behält mindestens ein
 * Schild – ein Schild, das stillschweigend verschwindet, fällt erst am Regal
 * auf. Ist alles in Ordnung, kommt dieselbe Liste zurück, damit kein
 * Neuzeichnen nötig wird.
 */
export function begrenze(schilder: FreiesSchild[]): FreiesSchild[] {
  let rest = MAX_SCHILDER;
  let geaendert = false;
  const neu = schilder.map((e, i) => {
    const gewollt = Number.isFinite(e.anzahl) ? Math.max(1, Math.round(e.anzahl)) : 1;
    // Den Nachfolgern bleibt je ein Schild reserviert, sonst reißt ihr
    // Mindestmaß die Grenze doch wieder.
    const anzahl = Math.min(gewollt, Math.max(1, rest - (schilder.length - i - 1)));
    rest -= anzahl;
    if (anzahl === e.anzahl) return e;
    geaendert = true;
    return { ...e, anzahl };
  });
  return geaendert ? neu : schilder;
}

const LEER: FreiStand = {
  schilder: [],
  formatId: null,
  mitBarcode: true,
  ready: false,
};

let stand: FreiStand = LEER;
let gelesen = false;
const horcher = new Set<() => void>();

function melden() {
  for (const h of horcher) h();
}

function schreiben(naechster: FreiStand) {
  stand = naechster;
  try {
    window.localStorage.setItem(
      SPEICHER,
      JSON.stringify({
        schilder: naechster.schilder,
        formatId: naechster.formatId,
        mitBarcode: naechster.mitBarcode,
      }),
    );
  } catch {
    // Privater Modus oder voller Speicher: die Liste gilt für diese Sitzung.
  }
  melden();
}

function lesen() {
  if (gelesen) return;
  gelesen = true;
  try {
    const roh = window.localStorage.getItem(SPEICHER);
    const daten = roh ? (JSON.parse(roh) as Partial<FreiStand>) : null;
    stand = {
      // Auch Altbestand wird begrenzt: ein früher gespeicherter Stapel mit
      // absurder Stückzahl soll die Seite nicht mehr einfrieren.
      schilder: Array.isArray(daten?.schilder) ? begrenze(daten.schilder) : [],
      formatId: typeof daten?.formatId === "string" ? daten.formatId : null,
      mitBarcode: typeof daten?.mitBarcode === "boolean" ? daten.mitBarcode : true,
      ready: true,
    };
  } catch {
    // Unlesbarer Speicher darf niemanden aufhalten – weg damit, leer weiter.
    try {
      window.localStorage.removeItem(SPEICHER);
    } catch {
      /* nichts zu tun */
    }
    stand = { ...LEER, ready: true };
  }
  melden();
}

export function subscribeFrei(horcherFn: () => void) {
  horcher.add(horcherFn);
  lesen();
  return () => {
    horcher.delete(horcherFn);
  };
}

export function getFreiStand(): FreiStand {
  return stand;
}

export function getFreiServerStand(): FreiStand {
  return LEER;
}

// --- Änderungen -------------------------------------------------------------

export function setzeSchilder(
  naechste: FreiesSchild[] | ((alt: FreiesSchild[]) => FreiesSchild[]),
) {
  const schilder =
    typeof naechste === "function" ? naechste(stand.schilder) : naechste;
  schreiben({ ...stand, schilder: begrenze(schilder), ready: true });
}

export function setzeFormat(formatId: string) {
  schreiben({ ...stand, formatId, ready: true });
}

export function setzeMitBarcode(mitBarcode: boolean) {
  schreiben({ ...stand, mitBarcode, ready: true });
}

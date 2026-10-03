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
      schilder: Array.isArray(daten?.schilder) ? daten.schilder : [],
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
  schreiben({ ...stand, schilder, ready: true });
}

export function setzeFormat(formatId: string) {
  schreiben({ ...stand, formatId, ready: true });
}

export function setzeMitBarcode(mitBarcode: boolean) {
  schreiben({ ...stand, mitBarcode, ready: true });
}

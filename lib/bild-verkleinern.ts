/**
 * Verkleinert ein Produktfoto im Browser, bevor es in den Bucket geht.
 *
 * Handyfotos kommen mit 3 MB und mehr. Jede Kachel im Shop läuft über den
 * Bildoptimierer von Next, der das Original erst von Supabase holen muss –
 * bei einem Raster mit vielen Bildern gleichzeitig lief ein Teil davon in
 * Zeitüberschreitungen, und die Kachel zeigte nur den Alt-Text. Ein Foto mit
 * 1600 px Kantenlänge reicht für die größte Darstellung (Galerie) und ist
 * meist unter 400 KB.
 *
 * Kleine Dateien gehen unverändert durch. Schlägt etwas fehl (Format nicht
 * dekodierbar, kein Canvas), kommt die Originaldatei zurück – ein Upload soll
 * nie an der Verkleinerung scheitern.
 */

export const MAX_BILD_KANTE = 1600;
/** Darunter wird nichts angefasst, auch wenn die Kante größer ist. */
const BEHALTEN_BIS_BYTES = 350 * 1024;

export interface VorbereitetesBild {
  blob: Blob;
  contentType: string;
  endung: string;
}

const ENDUNG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function alsBlob(canvas: HTMLCanvasElement, typ: string, qualitaet: number) {
  return new Promise<Blob | null>((fertig) =>
    canvas.toBlob((blob) => fertig(blob), typ, qualitaet),
  );
}

export async function bildVorbereiten(
  datei: File,
  originalEndung: string,
): Promise<VorbereitetesBild> {
  const original: VorbereitetesBild = {
    blob: datei,
    contentType: datei.type,
    endung: originalEndung,
  };

  try {
    // AVIF lässt sich nicht in jedem Browser wieder kodieren: unverändert.
    if (datei.type === "image/avif") return original;

    const bitmap = await createImageBitmap(datei);
    const laenge = Math.max(bitmap.width, bitmap.height);

    if (laenge <= MAX_BILD_KANTE && datei.size <= BEHALTEN_BIS_BYTES) {
      bitmap.close();
      return original;
    }

    const faktor = Math.min(1, MAX_BILD_KANTE / laenge);
    const breite = Math.round(bitmap.width * faktor);
    const hoehe = Math.round(bitmap.height * faktor);

    const canvas = document.createElement("canvas");
    canvas.width = breite;
    canvas.height = hoehe;
    const kontext = canvas.getContext("2d");
    if (!kontext) {
      bitmap.close();
      return original;
    }

    // JPEG kennt keine Transparenz: ohne weißen Grund würde sie schwarz.
    const mitAlpha = datei.type !== "image/jpeg";
    if (!mitAlpha) {
      kontext.fillStyle = "#ffffff";
      kontext.fillRect(0, 0, breite, hoehe);
    }
    kontext.imageSmoothingQuality = "high";
    kontext.drawImage(bitmap, 0, 0, breite, hoehe);
    bitmap.close();

    // PNG und WebP bleiben WebP (Alpha bleibt erhalten, deutlich kleiner als
    // PNG); fällt der Browser beim Kodieren auf PNG zurück, gilt das Original.
    const ziel = datei.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const ergebnis = await alsBlob(canvas, ziel, 0.82);
    if (!ergebnis || ergebnis.type !== ziel || ergebnis.size >= datei.size) {
      return original;
    }

    return { blob: ergebnis, contentType: ziel, endung: ENDUNG[ziel] };
  } catch {
    return original;
  }
}

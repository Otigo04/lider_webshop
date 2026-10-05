import "server-only";
import { esc, mm, schnittlinien } from "@/lib/preisschild-bogen";
import {
  RAND,
  RAND_OBEN_LINKS,
  SCHRIFT,
  SEITE,
  raster,
  type SchildFormat,
} from "@/lib/preisschild";
import { vorlagenLayout, type Vorlage } from "@/lib/preisschild-vorlagen";

/**
 * Druckbogen für Vorlagen-Schilder (ohne Preis).
 *
 * Gleiche Bogengeometrie wie `buildLabelSheetHtml()` – Rand, Raster,
 * Schnittlinien als eigene Ebene –, damit ein Vorlagen-Schild neben einem
 * Preisschild im selben Regal dieselbe Größe hat und aus demselben Schnitt
 * kommt. Die Zeichnung selbst rechnet `vorlagenLayout()`, dieselbe Funktion
 * wie die Vorschau.
 */

function schild(v: Vorlage, format: SchildFormat): string {
  const l = vorlagenLayout(v, format);

  const zeilen = l.zeilen
    .map((z) => `<span class="zeile">${esc(z)}</span>`)
    .join("");
  const zusatz = l.zusatzZeilen.length
    ? `<div class="zusatz" style="font-size:${mm(l.zusatzGroesse)};margin-top:${mm(l.zusatzAbstand)}">${l.zusatzZeilen
        .map((z) => `<span class="zeile">${esc(z)}</span>`)
        .join("")}</div>`
    : "";
  const linie =
    l.linieAbstand > 0
      ? `<div class="innenlinie" style="inset:${mm(l.linieAbstand)};border:${mm(l.linie)} solid ${esc(l.strich)}"></div>`
      : "";

  return `<div class="zelle" style="background:${esc(l.hintergrund)};color:${esc(l.schrift)};${
    l.rahmen > 0 ? `border:${mm(l.rahmen)} solid ${esc(l.strich)};` : ""
  }padding:${mm(l.luft)}">
    ${linie}
    <div class="text" style="font-size:${mm(l.groesse)}">${zeilen}</div>
    ${zusatz}
  </div>`;
}

export function buildVorlagenSheetHtml(
  schilder: Vorlage[],
  { format, autoPrint = true }: { format: SchildFormat; autoPrint?: boolean },
): string {
  const r = raster(format);

  const seiten: string[] = [];
  for (let start = 0; start < schilder.length; start += r.proBogen) {
    const teil = schilder.slice(start, start + r.proBogen);
    seiten.push(`<section class="bogen">
      <div class="raster">${teil.map((s) => schild(s, format)).join("")}</div>
      <div class="linien" aria-hidden="true">${schnittlinien(format)}</div>
    </section>`);
  }
  if (seiten.length === 0) {
    seiten.push(
      `<section class="bogen"><p class="leer">Keine Schilder ausgewählt.</p></section>`,
    );
  }

  const titel = `Vorlagen-Schilder ${format.name} – ${schilder.length} Stück auf ${seiten.length} Bogen`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html { background: #8a8a8a; }
  body {
    margin: 0;
    font-family: ${SCHRIFT};
    color: #000;
    /* Sonst druckt Chrome die Farbflächen weiß. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .bogen {
    position: relative;
    width: ${mm(SEITE.breite)};
    height: ${mm(SEITE.hoehe)};
    padding: ${mm(RAND_OBEN_LINKS)} ${mm(RAND)} ${mm(RAND)} ${mm(RAND_OBEN_LINKS)};
    margin: 0 auto 10mm;
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
    page-break-after: always;
    break-after: page;
  }
  .bogen:last-of-type { page-break-after: auto; break-after: auto; }
  .raster {
    display: grid;
    grid-template-columns: repeat(${r.spalten}, ${mm(format.breite)});
    grid-auto-rows: ${mm(format.hoehe)};
    width: ${mm(r.rasterB)};
    height: ${mm(r.rasterH)};
  }
  .linien {
    position: absolute;
    top: ${mm(RAND_OBEN_LINKS)};
    left: ${mm(RAND_OBEN_LINKS)};
    width: ${mm(r.rasterB)};
    height: ${mm(r.rasterH)};
    pointer-events: none;
  }
  .schnitt { position: absolute; background: #9a9a9a; }
  .schnitt.v { top: -2mm; height: calc(100% + 4mm); width: 0.2mm; }
  .schnitt.h { left: -2mm; width: calc(100% + 4mm); height: 0.2mm; }

  .zelle {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
  }
  .innenlinie { position: absolute; pointer-events: none; opacity: 0.6; }
  .text {
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: 0.02em;
    white-space: nowrap;
    /* Versalien haben keine Unterlängen: die Zeilenbox sitzt optisch zu tief. */
    transform: translateY(-0.035em);
  }
  .text .zeile { display: block; }
  .zusatz {
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .leer { padding: 20mm; font-size: 12pt; }
  .leiste {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 10px; background: #1f2937; color: #fff; font-size: 14px;
  }
  .leiste button {
    font: inherit; padding: 6px 14px; border: 0; border-radius: 4px;
    background: #fff; color: #111827; cursor: pointer;
  }
  @media print {
    html { background: #fff; }
    .leiste { display: none; }
    .bogen { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="leiste">
    <span>${esc(titel)}</span>
    <button type="button" onclick="window.print()">Drucken</button>
  </div>

${seiten.join("\n")}

  ${
    autoPrint
      ? `<script>
    window.addEventListener("load", function () {
      window.setTimeout(function () { window.print(); }, 200);
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

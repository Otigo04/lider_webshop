/**
 * Prüft das Rechnungslesen an einem echten PDF, ohne Browser und Anmeldung.
 *
 *   node --import ./tests/register.mjs --experimental-strip-types \
 *     --disable-warning=ExperimentalWarning --env-file=.env.local \
 *     scripts/rechnung-lesen-check.mjs "<pfad zum pdf>"
 *
 * Druckt die gelesenen Positionen samt Gegenproben. Bucht nichts.
 */
import { readFile } from "node:fs/promises";
import { leseRechnung } from "@/lib/rechnung-lesen";
import { pruefeSumme, zeileStimmt } from "@/lib/rechnung-import";

const pfad = process.argv[2];
if (!pfad) {
  console.error("Aufruf: … rechnung-lesen-check.mjs <pdf>");
  process.exit(1);
}

const bytes = new Uint8Array(await readFile(pfad));
const r = await leseRechnung(bytes, []);

console.log(`${r.lieferant} · Rechnung ${r.rechnungsnummer} · ${r.datum ?? "ohne Datum"}`);
for (const p of r.positionen) {
  console.log(
    ` ${zeileStimmt(p) ? " " : "!"} ${(p.ean ?? "-").padEnd(14)} ${String(p.menge).padStart(4)} × ${p.listenpreis} -${p.rabattProzent}%  UVP ${p.uvp ?? "-"}  = ${p.zeilenbetrag}  ${zeileStimmt(p) ? "ok" : "ZEILE PASST NICHT"}  ${p.name.slice(0, 50)}`,
  );
}
const s = pruefeSumme(r);
console.log(
  `${r.positionen.length} Positionen · Summe ${s.summe} · erwartet ${s.erwartet} (Netto ${r.nettoGesamt} − Nebenkosten ${r.nebenkostenNetto}) · ${s.ok ? "OK" : "SUMME PASST NICHT"}`,
);

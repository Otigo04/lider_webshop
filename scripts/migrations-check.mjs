/**
 * Prüft supabase/migrations/ auf die Fehler, die sich beim Einspielen von
 * Hand einschleichen:
 *
 *   - Nummer fehlt (Lücke) oder kommt doppelt vor
 *   - Dateiname folgt nicht dem Muster NNN_name.sql
 *   - Datei ist leer
 *   - README nennt eine andere letzte Migration als die tatsächlich letzte
 *
 * Doppelte Nummern, die schon eingespielt sind, stehen in BEKANNT – eine
 * umbenannte Datei wäre für jeden, der nach Nummer einspielt, eine neue.
 *
 *   npm run check:migrations
 */
import { readdirSync, readFileSync, statSync } from "node:fs";

const DIR = "supabase/migrations";
// Gleiche Nummer, bereits eingespielt: nicht umbenennen.
const BEKANNT = { "037": ["037_abholtermin_mindestvorlauf.sql", "037_versandkostengrenze.sql"] };

const dateien = readdirSync(DIR).filter((f) => !f.startsWith(".")).sort();
const fehler = [];
const nummern = new Map();

for (const f of dateien) {
  const m = f.match(/^(\d{3})_[a-z0-9_]+\.sql$/);
  if (!m) {
    fehler.push(`${f}: Name folgt nicht dem Muster NNN_name.sql`);
    continue;
  }
  if (statSync(`${DIR}/${f}`).size === 0) fehler.push(`${f}: Datei ist leer`);
  nummern.set(m[1], [...(nummern.get(m[1]) ?? []), f]);
}

const nums = [...nummern.keys()].map(Number).sort((a, b) => a - b);
for (let i = 1; i < nums.length; i++) {
  if (nums[i] !== nums[i - 1] + 1) {
    fehler.push(`Lücke in der Nummerierung: ${nums[i - 1]} → ${nums[i]}`);
  }
}
if (nums[0] !== 1) fehler.push(`Erste Migration ist ${nums[0]}, erwartet 1`);

for (const [nr, liste] of nummern) {
  if (liste.length < 2) continue;
  const bekannt = BEKANNT[nr];
  const ok = bekannt && liste.length === bekannt.length && liste.every((f) => bekannt.includes(f));
  if (!ok) fehler.push(`Nummer ${nr} mehrfach vergeben: ${liste.join(", ")}`);
}

const letzte = dateien.filter((f) => /^\d{3}_/.test(f)).at(-1);
try {
  const readme = readFileSync("README.md", "utf8");
  const genannt = readme.match(/bis\s+`?(\d{3}_[a-z0-9_]+\.sql)`?/)?.[1];
  if (genannt && genannt !== letzte) {
    fehler.push(`README nennt „bis ${genannt}", die letzte Migration ist ${letzte}`);
  }
} catch {
  /* README fehlt: nichts zu vergleichen */
}

if (fehler.length) {
  console.error(`Migrationen: ${fehler.length} Problem(e)\n- ${fehler.join("\n- ")}`);
  process.exit(1);
}
console.log(`Migrationen in Ordnung: ${dateien.length} Dateien, letzte ${letzte}`);

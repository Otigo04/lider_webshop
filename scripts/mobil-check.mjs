/**
 * Prüft Seiten in echter Handy-Größe und meldet Layoutfehler.
 *
 *   node scripts/mobil-check.mjs [basis-url]
 *
 * Startet ein eigenes, unsichtbares Chrome-Fenster mit 390 × 844 (iPhone-Maß),
 * damit die Media Queries wirklich greifen – ein verkleinertes Fenster oder
 * ein iframe reicht dafür nicht.
 *
 * Gemeldet wird, was sich automatisch feststellen lässt:
 *  - Seite deutlich höher als ihr Inhalt (das "man scrollt ins Leere"-Problem)
 *  - waagerechter Überlauf samt der Elemente, die ihn verursachen
 *
 * Nur ein Entwicklungswerkzeug, nichts davon läuft im Betrieb.
 */
import { spawn } from "node:child_process";
import { setTimeout as warte } from "node:timers/promises";

const BASIS = process.argv[2] ?? "http://localhost:3000";
const SEITEN = ["/", "/impressum", "/datenschutz", "/login", "/shop"];
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--window-size=390,844",
    "--hide-scrollbars",
    "--no-first-run",
    "--user-data-dir=/tmp/lider-mobil-check",
  ],
  { stdio: "ignore" },
);

process.on("exit", () => chrome.kill());

/** Wartet, bis der Debug-Port antwortet. */
async function zielAdresse() {
  for (let versuch = 0; versuch < 40; versuch++) {
    try {
      const antwort = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await antwort.json()).webSocketDebuggerUrl;
    } catch {
      await warte(250);
    }
  }
  throw new Error("Chrome antwortet nicht auf dem Debug-Port.");
}

const socket = new WebSocket(await zielAdresse());
await new Promise((fertig) => (socket.onopen = fertig));

let laufendeId = 0;
const offen = new Map();
socket.onmessage = (nachricht) => {
  const daten = JSON.parse(nachricht.data);
  const warteAuf = offen.get(daten.id);
  if (!warteAuf) return;
  offen.delete(daten.id);
  if (daten.error) warteAuf.ab(new Error(daten.error.message));
  else warteAuf.auf(daten.result);
};

function sende(methode, parameter = {}, sitzung) {
  const id = ++laufendeId;
  return new Promise((auf, ab) => {
    offen.set(id, { auf, ab });
    socket.send(JSON.stringify({ id, method: methode, params: parameter, sessionId: sitzung }));
  });
}

const { targetId } = await sende("Target.createTarget", { url: "about:blank" });
const { sessionId } = await sende("Target.attachToTarget", { targetId, flatten: true });

await sende("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
}, sessionId);
await sende("Page.enable", {}, sessionId);
await sende("Runtime.enable", {}, sessionId);

const MESSUNG = `(() => {
  const d = document.documentElement;
  const letzte = [...document.body.querySelectorAll('*')]
    .map(e => e.getBoundingClientRect().bottom + window.scrollY)
    .reduce((a, b) => Math.max(a, b), 0);
  const breit = [...document.querySelectorAll('*')]
    .filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.right > d.clientWidth + 1 || r.left < -1);
    })
    .slice(0, 6)
    .map(e => e.tagName.toLowerCase() +
      (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') +
      ' [' + Math.round(e.getBoundingClientRect().left) + '…' + Math.round(e.getBoundingClientRect().right) + ']');
  return JSON.stringify({
    seitenhoehe: d.scrollHeight,
    inhaltsende: Math.round(letzte),
    sichtbar: d.clientHeight,
    breite: d.scrollWidth,
    sichtbarBreit: d.clientWidth,
    ueberbreit: breit,
  });
})()`;

let fehler = 0;

for (const pfad of SEITEN) {
  await sende("Page.navigate", { url: BASIS + pfad }, sessionId);
  await warte(1800);

  const { result } = await sende(
    "Runtime.evaluate",
    { expression: MESSUNG, returnByValue: true },
    sessionId,
  );
  const m = JSON.parse(result.value);

  const leerlauf = m.seitenhoehe - m.inhaltsende;
  const probleme = [];
  // 40 px Toleranz für Ränder und Rundung.
  if (leerlauf > 40) probleme.push(`${leerlauf} px leerer Raum unter dem Inhalt`);
  if (m.breite > m.sichtbarBreit + 1) {
    probleme.push(`waagerechter Überlauf: ${m.breite} statt ${m.sichtbarBreit} px`);
    probleme.push(...m.ueberbreit.map((e) => `  → ${e}`));
  }

  if (probleme.length) {
    fehler++;
    console.log(`\n✗ ${pfad}  (Höhe ${m.seitenhoehe}, Inhalt endet bei ${m.inhaltsende})`);
    for (const p of probleme) console.log(`   ${p}`);
  } else {
    console.log(`✓ ${pfad}  (Höhe ${m.seitenhoehe})`);
  }
}

console.log(fehler ? `\n${fehler} Seite(n) mit Befund.` : "\nAlles sauber.");
socket.close();
chrome.kill();
process.exit(fehler ? 1 : 0);

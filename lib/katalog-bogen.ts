import { accentIndex } from "@/lib/accent-colors";
import { barcode as strichcode, MODUL_MIN, MODUL_NENN } from "@/lib/barcode";
import { formatDate, formatPrice } from "@/lib/format";
import {
  ANGEBOT_FOTO_MM,
  ANGEBOT_KOPF_MM,
  ANGEBOT_RAND_MM,
  BALD_SLUG,
  FUSS,
  KOPF,
  REDUZIERT_SLUG,
  NUTZ,
  RAND,
  RASTER,
  SEITE,
  ausfuehrungMm,
  ausfuehrungName,
  bestandText,
  einheitMm,
  katalogPreis,
  listenStaffeln,
  type AngebotBlock,
  type ArtikelBlock,
  type KatalogArtikel,
  type KatalogAufbau,
  type KatalogEinstellungen,
  type KatalogPreis,
  type KatalogSeite,
  type KatalogStaffel,
  type UeberschriftBlock,
} from "@/lib/katalog";
import { SCHRIFT, preisTeile } from "@/lib/preisschild";

/**
 * Der Katalog als druckfertiges HTML.
 *
 * HTML und kein PDF, wie der Preisschild-Bogen: ein Katalog ist Raster,
 * Tabelle und Typografie – das setzt CSS ohne eine Zeile Koordinatenrechnerei,
 * und der Browser macht daraus über „Als PDF sichern" die Datei zum
 * Verschicken.
 *
 * Wo etwas steht, entscheidet nicht diese Datei, sondern katalogAufbau():
 * jeder Block kommt mit Zeile, Höhe und Spalte herein und wird genau dort ins
 * Raster gesetzt. Hier fällt keine Umbruchentscheidung mehr – sonst stimmten
 * die Seitenzahlen im Inhaltsverzeichnis nur zufällig.
 *
 * Gestaltungsregeln, für beide Stile: keine Verläufe, keine Schatten, keine
 * runden Ecken, keine Symbole. Eine Schriftfamilie, zwei Gewichte. Preise
 * rechtsbündig mit Tabellenziffern. Jede Zelle ist gleich aufgebaut; eine
 * leere Angabe lässt ihren Platz frei, statt den Rest nachrücken zu lassen –
 * sonst stünden die Preise einer Zeile auf verschiedenen Höhen.
 */

export interface KatalogFirma {
  name: string | null;
  strasse: string | null;
  plzOrt: string | null;
  telefon: string | null;
  email: string | null;
  website: string | null;
  /** company_settings.pos_prices_gross – wie der Ladenpreis gepflegt ist */
  ladenpreiseBrutto: boolean;
}

export interface KatalogBogenOptions {
  /** Lockup (Wappen über Schriftzug) für Titel- und Rückseite */
  logo: string | null;
  /** Wappen allein für die Kopfzeile */
  wappen: string | null;
  /** Schriftzug „LIDER" quer, neben dem Wappen in der Kopfzeile */
  wortmarke: string | null;
  /** Datum der Ausgabe – steht in jeder Fußzeile */
  stand: Date;
  /** Druckdialog selbst öffnen, sobald alle Fotos da sind */
  autoPrint: boolean;
}

/* Markenfarben aus app/globals.css. Hier fest, weil der Bogen ein eigenes
   Dokument ohne das Stylesheet der Anwendung ist. */
const BLAU = "#284078";
const GOLD = "#b8721c";
const ROT = "#a02020";
const NAVY = "#131f3a";
const GRAU = "#5b6472";
const LINIE = "#b9bec7";
/** Grund hinter den Fotos */
const FLAECHE = "#f1f2f5";

/** Die sechs Warengruppenfarben (--tag-N-fg), für das Kopfband im Prospekt. */
const AKZENT = ["#283f78", "#0f5f57", "#9a4310", "#9c1f47", "#4c2f96", "#1c6b34"];

function akzent(slug: string): string {
  if (slug === REDUZIERT_SLUG) return ROT;
  if (slug === BALD_SLUG) return GOLD;
  return AKZENT[accentIndex(slug) - 1] ?? BLAU;
}

/** Kein Text aus der Datenbank darf als Markup im Bogen landen. */
function esc(wert: unknown): string {
  return String(wert ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mm(wert: number): string {
  return `${wert.toFixed(3)}mm`;
}

/**
 * Foto in der Breite, die das Papier braucht.
 *
 * Über den Bildoptimierer von Next und nicht als Original: ein Katalog mit
 * dreihundert Fotos zu je einigen Megabyte ergäbe ein PDF, das sich nicht
 * verschicken lässt. Das Original reist als `data-roh` mit – verweigert der
 * Optimierer die Adresse, lädt das Skript am Ende des Dokuments es nach.
 */
function foto(url: string | null, breite: 256 | 640 | 828): string {
  if (!url) return "";
  const klein = `/_next/image?url=${encodeURIComponent(url)}&w=${breite}&q=75`;
  return `<img src="${esc(klein)}" data-roh="${esc(url)}" alt="">`;
}

/**
 * Strichcode als Vektorgrafik. Leer, wenn die Nummer kein gültiger EAN ist
 * oder die Breite nicht für lesbare Module reicht – ein Code, den kein
 * Scanner liest, ist schlechter als keiner.
 *
 * Ein Pfad statt eines Elements je Strich: dreihundert Artikel mit je sechzig
 * Strichen wären achtzehntausend Knoten für nichts.
 */
function strichbild(roh: string | null, maxBreite: number, hoehe: number): string {
  const code = strichcode(roh);
  if (!code) return "";
  const modul = Math.min(MODUL_NENN, maxBreite / code.breite);
  if (modul < MODUL_MIN) return "";

  let x = 0;
  let pfad = "";
  for (const abschnitt of code.abschnitte) {
    if (abschnitt.strich) pfad += `M${x} 0h${abschnitt.module}v1h-${abschnitt.module}z`;
    x += abschnitt.module;
  }

  return `<span class="bc"><svg width="${mm(code.breite * modul)}" height="${mm(hoehe)}" viewBox="0 0 ${code.breite} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${pfad}"/></svg><span class="bcz">${esc(code.text)}</span></span>`;
}

function mengenangabe(ab: number): string {
  return `ab ${new Intl.NumberFormat("de-DE").format(ab)} St.`;
}

/**
 * Mengenangabe einer Staffel – leer, wenn es nur einen Preis ab einem Stück
 * gibt. „ab 1 St." über dem einzigen Preis ist eine Zeile, die nichts sagt.
 */
function stufe(s: KatalogStaffel, alle: KatalogStaffel[]): string {
  return alle.length === 1 && s.ab <= 1 ? "" : mengenangabe(s.ab);
}

function merkmalText(artikel: KatalogArtikel): string {
  return artikel.merkmale
    .map((m) => (m.merkmal ? `${m.merkmal}: ${m.wert}` : m.wert))
    .join(" · ");
}

interface Kontext {
  e: KatalogEinstellungen;
  prospekt: boolean;
}

/** „Neu" und „Topseller" – als Rahmen (sachlich) oder gefülltes Feld (Prospekt). */
function kennzeichen(artikel: KatalogArtikel, k: Kontext): string {
  if (!k.e.zeigeKennzeichen) return "";
  const teile: string[] = [];
  if (artikel.kategorieSlug === BALD_SLUG) {
    teile.push(`<span class="kz bald">Vorbestellen</span>`);
  }
  if (artikel.neu) teile.push(`<span class="kz neu">Neu</span>`);
  if (artikel.topseller) teile.push(`<span class="kz top">Topseller</span>`);
  const reduziert = katalogPreis(artikel, k.e.preisart)?.reduziert;
  // In Kacheln und Groß sagt das rote Prozentfeld auf dem Foto dasselbe.
  if (reduziert && k.e.layout === "liste") {
    teile.push(`<span class="kz akt">Reduziert −${reduziert.prozent} %</span>`);
  }
  return teile.join("");
}

/**
 * Der große Preis einer Zelle samt Streichpreis.
 *
 * Im Prospekt Euro groß und Cent hochgestellt, wie am Regal (preisTeile()):
 * die Zahl, die man beim Blättern liest, ist der Eurobetrag.
 */
function preisblock(preis: KatalogPreis | null, k: Kontext): string {
  if (!preis) return "";
  const reduziert = k.e.zeigeKennzeichen ? preis.reduziert : null;

  const betrag = k.prospekt
    ? (() => {
        const { euro, cent } = preisTeile(preis.preis);
        return `<span class="euro">${esc(euro)}</span><span class="cent">${esc(cent)}</span><span class="waehrung">€</span>`;
      })()
    : esc(formatPrice(preis.preis));

  return `<div class="preis${reduziert ? " red" : ""}">
    <div class="pz">${preis.ab > 1 ? esc(mengenangabe(preis.ab)) : ""}${
      reduziert
        ? ` <s>${esc(formatPrice(reduziert.vorher))}</s>`
        : ""
    }</div>
    <div class="pb">${betrag}</div>
  </div>`;
}

/** Rotes Prozentfeld auf dem Foto – in beiden Stilen, eine Reduzierung muss man beim Blättern sehen. */
function prozentfeld(preis: KatalogPreis | null, k: Kontext): string {
  if (!k.e.zeigeKennzeichen || !preis?.reduziert) return "";
  return `<span class="prozent"><b>−${preis.reduziert.prozent}</b><i>%</i></span>`;
}

/** Weitere Staffeln als Nebenzeile: „ab 50 St. 1,30 € · ab 200 St. 1,10 €". */
function staffelzeile(preis: KatalogPreis | null): string {
  if (!preis || preis.staffeln.length < 2) return "";
  return listenStaffeln(preis.staffeln)
    .slice(1)
    .map((s) => `${esc(mengenangabe(s.ab))} <b>${esc(formatPrice(s.preis))}</b>`)
    .join(" · ");
}

// --- Zellen ------------------------------------------------------------------

function kachel(block: ArtikelBlock, k: Kontext): string {
  const a = block.artikel;
  const preis = katalogPreis(a, k.e.preisart);
  const gross = k.e.layout === "gross";
  const innen = NUTZ.breite / RASTER[k.e.layout].spalten - 4;

  // Im großen Raster steht die volle Staffeltabelle, in der Kachel die
  // Nebenzeile – dort ist für eine Tabelle kein Platz.
  const staffeln =
    k.e.preisart !== "grosshandel"
      ? ""
      : gross
        ? `<table class="staffeln">${(preis?.staffeln.length ?? 0) > 1 ? kuerze(preis!.staffeln, 3).map((s) => `<tr><td>${esc(mengenangabe(s.ab))}</td><td>${esc(formatPrice(s.preis))}</td></tr>`).join("") : ""}</table>`
        : `<div class="staffel">${staffelzeile(preis)}</div>`;

  const aktion = k.e.zeigeKennzeichen && preis?.reduziert ? " aktion" : "";
  const nr = [
    `Art.-Nr. ${esc(a.sku)}`,
    k.e.zeigeMerkmale && a.merkmale.length > 0 ? esc(merkmalText(a)) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Reihenfolge von oben nach unten: Foto, Name, Nummer, Preis – der Preis
  // steht unmittelbar unter dem Artikel, nicht am Fuß einer hohen Zelle.
  // Eine Beschreibung hat hier keinen Platz; sie steht in der Liste und im
  // Angebot.
  return `<div class="zelle kachel${aktion}" style="${platz(block)}--ak:${akzent(a.kategorieSlug)};">
    <div class="foto">${foto(a.bildUrl, gross ? 828 : 640)}<div class="marken">${kennzeichen(a, k)}</div>${prozentfeld(preis, k)}${bestandschild(a, k)}</div>
    <div class="name">${esc(a.name)}</div>
    <div class="nr">${nr}</div>
    <div class="kaufen">
      ${preisblock(preis, k)}
      <div class="code">${k.e.zeigeBarcode ? strichbild(a.barcode, innen * (gross ? 0.5 : 0.57), gross ? 8 : 6) : ""}</div>
    </div>
    ${staffeln}
  </div>`;
}

/** Verfügbare Menge als Schild unten links auf dem Foto. */
function bestandschild(artikel: KatalogArtikel, k: Kontext): string {
  const text = bestandText(artikel, k.e);
  if (!text) return "";
  return `<span class="bestand${artikel.bestand <= 0 ? " aus" : ""}">${esc(text)}</span>`;
}

/** Erste Staffeln und die letzte – wenn mehr gepflegt sind, als Zeilen da sind. */
function kuerze(staffeln: KatalogStaffel[], max: number): KatalogStaffel[] {
  if (staffeln.length <= max) return staffeln;
  return [...staffeln.slice(0, max - 1), staffeln[staffeln.length - 1]];
}

/** Preisspalten der Liste: bis zu drei Staffeln, oder der eine Ladenpreis. */
function listenpreise(preis: KatalogPreis | null, k: Kontext): string {
  if (k.e.preisart === "ohne") return "";
  const reduziert = k.e.zeigeKennzeichen ? (preis?.reduziert ?? null) : null;

  if (k.e.preisart === "laden") {
    return `<div class="lp${reduziert ? " red" : ""}">
      <span class="pz">${reduziert ? `<s>${esc(formatPrice(reduziert.vorher))}</s> <b>−${reduziert.prozent} %</b>` : ""}</span>
      <span class="pb">${preis ? esc(formatPrice(preis.preis)) : ""}</span>
    </div>`;
  }

  const staffeln = listenStaffeln(preis?.staffeln ?? []);
  return [0, 1, 2]
    .map((i) => {
      const s = staffeln[i];
      if (!s) return `<div class="lp"></div>`;
      const rot = i === 0 && reduziert;
      return `<div class="lp${rot ? " red" : ""}">
        <span class="pz">${esc(stufe(s, staffeln))}${rot ? ` <s>${esc(formatPrice(reduziert.vorher))}</s>` : ""}</span>
        <span class="pb">${esc(formatPrice(s.preis))}</span>
      </div>`;
    })
    .join("");
}

function listenzeile(block: ArtikelBlock, k: Kontext): string {
  const a = block.artikel;
  const preis = katalogPreis(a, k.e.preisart);
  const zusatz = [
    `Art.-Nr. ${esc(a.sku)}`,
    k.e.zeigeMerkmale && a.merkmale.length > 0 ? esc(merkmalText(a)) : "",
    esc(bestandText(a, k.e)),
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="zelle zeile" style="${platz(block)}--ak:${akzent(a.kategorieSlug)};">
    <div class="foto${a.bildUrl ? "" : " leer"}">${foto(a.bildUrl, 256)}</div>
    <div class="angaben">
      <div class="name${k.e.zeigeBeschreibung ? " einzeilig" : ""}">${esc(a.name)}${kennzeichen(a, k)}</div>
      ${k.e.zeigeBeschreibung ? `<div class="text">${esc(a.beschreibung ?? "")}</div>` : ""}
      <div class="nr">${zusatz}</div>
    </div>
    ${k.e.zeigeBarcode ? `<div class="code">${strichbild(a.barcode, 31, 6.2)}</div>` : ""}
    ${listenpreise(preis, k)}
  </div>`;
}

/**
 * Ein Ausführungs-Angebot über die volle Breite: Foto links, Tabelle rechts.
 *
 * Tragen alle Ausführungen dieselben Mengenstufen, stehen die im Tabellenkopf
 * und die Zellen zeigen nur noch den Preis. Unterscheiden sie sich, steht die
 * Menge in jeder Zelle – eine gemeinsame Kopfzeile würde dann lügen.
 */
function angebot(block: AngebotBlock, k: Kontext): string {
  const liste = k.e.layout === "liste";
  const zeilenhoehe = liste
    ? einheitMm("liste") * (k.e.zeigeBarcode ? 2 : 1)
    : ausfuehrungMm(k.e.zeigeBarcode);
  const kopfhoehe = liste ? einheitMm("liste") * RASTER.liste.artikel : ANGEBOT_KOPF_MM;

  const preise = block.ausfuehrungen.map((a) => katalogPreis(a, k.e.preisart));
  const staffeln = preise.map((p) => listenStaffeln(p?.staffeln ?? []));
  const spalten =
    k.e.preisart === "ohne"
      ? 0
      : k.e.preisart === "laden"
        ? 1
        : Math.max(1, ...staffeln.map((s) => s.length));
  const stufen = staffeln[0]?.map((s) => s.ab) ?? [];
  const einheitlich =
    !liste &&
    k.e.preisart === "grosshandel" &&
    staffeln.every(
      (s) => s.length === stufen.length && s.every((x, i) => x.ab === stufen[i]),
    );

  // Eine Spalte „Verfügbar" – in der Liste steht die Menge in der Zeile.
  const mitBestand =
    !liste &&
    block.ausfuehrungen.some((a) => bestandText(a, k.e) !== "");

  const kopfzeile = liste
    ? ""
    : `<tr class="th" style="height:${mm(zeilenhoehe)}">
        <th>Ausführung</th><th>Art.-Nr.</th>${k.e.zeigeBarcode ? "<th>EAN</th>" : ""}${mitBestand ? "<th>Verfügbar</th>" : ""}${Array.from(
          { length: spalten },
          (_, i) =>
            `<th class="r">${k.e.preisart === "laden" ? "Preis" : einheitlich ? esc(mengenangabe(stufen[i])) : i === 0 ? "Preis" : ""}</th>`,
        ).join("")}
      </tr>`;

  const zeilen = block.ausfuehrungen
    .map((a, index) => {
      const preis = preise[index];
      const reduziert = k.e.zeigeKennzeichen ? (preis?.reduziert ?? null) : null;
      const zellen = Array.from({ length: spalten }, (_, i) => {
        if (k.e.preisart === "laden") {
          return `<td class="r${reduziert ? " red" : ""}">${reduziert ? `<s>${esc(formatPrice(reduziert.vorher))}</s> ` : ""}<b>${preis ? esc(formatPrice(preis.preis)) : ""}</b></td>`;
        }
        const s = staffeln[index][i];
        if (!s) return `<td class="r"></td>`;
        const rot = i === 0 && reduziert;
        return `<td class="r${rot ? " red" : ""}">${einheitlich ? "" : `<span class="pz">${esc(stufe(s, staffeln[index]))}</span> `}${rot ? `<s>${esc(formatPrice(reduziert.vorher))}</s> ` : ""}<b>${esc(formatPrice(s.preis))}</b></td>`;
      }).join("");

      return `<tr style="height:${mm(zeilenhoehe)}">
        <td class="aus">${esc(ausfuehrungName(a))}</td>
        <td class="nr">${esc(a.sku)}</td>
        ${k.e.zeigeBarcode ? `<td class="code">${strichbild(a.barcode, 30, zeilenhoehe - 4)}</td>` : ""}
        ${mitBestand ? `<td class="bst">${esc(new Intl.NumberFormat("de-DE").format(Math.max(0, a.bestand)))}</td>` : ""}
        ${zellen}
      </tr>`;
    })
    .join("");

  const hoechste = k.e.zeigeKennzeichen
    ? Math.max(0, ...preise.map((p) => p?.reduziert?.prozent ?? 0))
    : 0;
  const bis = preise.filter((p) => p?.reduziert).length < preise.length;

  return `<div class="zelle angebot${liste ? " in-liste" : ""}${hoechste > 0 ? " aktion" : ""}" style="${platz(block)}--ak:${akzent(block.ausfuehrungen[0]?.kategorieSlug ?? "")};">
    <div class="foto${block.bildUrl ? "" : " leer"}">${foto(block.bildUrl, liste ? 256 : 640)}${
      block.ausfuehrungen[0]?.kategorieSlug === BALD_SLUG && !liste
        ? `<span class="marken"><span class="kz bald">Vorbestellen</span></span>`
        : ""
    }${
      hoechste > 0 && !liste
        ? `<span class="prozent">${bis ? "<u>bis</u>" : ""}<b>−${hoechste}</b><i>%</i></span>`
        : ""
    }</div>
    <div class="rechts">
      <div class="titelzeile" style="height:${mm(kopfhoehe)}">
        <div class="name">${esc(block.titel)}${block.fortsetzung ? ` <span class="forts">Fortsetzung</span>` : ""}</div>
        ${k.e.zeigeBeschreibung && !block.fortsetzung ? `<div class="text">${esc(block.beschreibung ?? "")}</div>` : ""}
      </div>
      <table class="aust">${kopfzeile}${zeilen}</table>
    </div>
  </div>`;
}

function ueberschrift(block: UeberschriftBlock, k: Kontext): string {
  const farbe = k.prospekt ? `background:${akzent(block.kategorieSlug)};` : "";
  return `<div class="zwischen" style="${platz(block)}"><span style="${farbe}">${esc(block.kategorie)}</span></div>`;
}

/** Rasterposition eines Blocks – das einzige, was den Umbruch ins CSS trägt. */
function platz(block: { zeile: number; hoehe: number; spalte?: number }): string {
  const spalte = block.spalte === undefined ? "1 / -1" : String(block.spalte + 1);
  return `grid-row:${block.zeile + 1} / span ${block.hoehe};grid-column:${spalte};`;
}

// --- Seiten ------------------------------------------------------------------

function preishinweis(e: KatalogEinstellungen, firma: KatalogFirma): string {
  if (e.preisart === "ohne") return "";
  if (e.preisart === "grosshandel") {
    return "Alle Preise in Euro, netto zzgl. gesetzl. USt.";
  }
  return firma.ladenpreiseBrutto
    ? "Alle Preise in Euro inkl. gesetzl. USt."
    : "Alle Preise in Euro zzgl. gesetzl. USt.";
}

function kopfzeile(
  links: string,
  farbe: string,
  k: Kontext,
  opt: KatalogBogenOptions,
): string {
  // Das Logo statt des Wortes: Wappen und Schriftzug als Bild. Fehlt eine
  // der Dateien, steht der Name als Text – nie eine leere Ecke.
  const marke =
    opt.wappen || opt.wortmarke
      ? `${opt.wappen ? `<img class="wappen" src="${esc(opt.wappen)}" alt="">` : ""}${opt.wortmarke ? `<img class="wort" src="${esc(opt.wortmarke)}" alt="LIDER">` : ""}`
      : `<b>LIDER</b>`;
  return `<header class="kopf" style="--kf:${farbe};">
    <span class="gruppe">${esc(links)}</span>
    <span class="marke">${marke}</span>
  </header>`;
}

function fusszeile(
  nummer: number,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  return `<footer class="fuss">
    <span>${esc(k.e.title)} · Stand ${esc(formatDate(opt.stand))}</span>
    <span>${esc(preishinweis(k.e, firma))}</span>
    <span>Seite ${nummer}</span>
  </footer>`;
}

/**
 * Spaltenköpfe der Liste: steht, was die Spalten sind – Bezeichnung, EAN-Code,
 * Preis netto bzw. inkl. USt. Die Breiten sind die der Zeile (.zeile), damit
 * die Köpfe über ihren Spalten stehen.
 */
function listenkopf(k: Kontext, firma: KatalogFirma, staffeln: number): string {
  const e = k.e;
  const preis =
    e.preisart === "ohne"
      ? ""
      : e.preisart === "grosshandel"
        ? // Die Zeilen haben immer drei Preisplätze; ein leerer bleibt leer.
          ["Preis netto", "Staffelpreis", "Staffelpreis"]
            .map((t, i) => `<span class="kp p1s">${i < staffeln ? t : ""}</span>`)
            .join("")
        : `<span class="kp p1">${firma.ladenpreiseBrutto ? "Preis inkl. USt." : "Preis zzgl. USt."}</span>`;
  return `<div class="listenkopf" style="grid-row:1;grid-column:1 / -1;">
    <span class="kf"></span>
    <span class="ka">Bezeichnung · Art.-Nr.</span>
    ${e.zeigeBarcode ? `<span class="kc">EAN-Code</span>` : ""}
    ${preis}
  </div>`;
}

/** Wie viele Preisspalten die Zeilen dieser Seite brauchen (1–3). */
function staffelSpalten(seite: KatalogSeite, k: Kontext): number {
  let n = 1;
  for (const block of seite.bloecke) {
    if (block.art !== "artikel") continue;
    const staffeln = katalogPreis(block.artikel, k.e.preisart)?.staffeln ?? [];
    n = Math.max(n, listenStaffeln(staffeln).length);
  }
  return Math.min(n, 3);
}

function artikelseite(
  seite: KatalogSeite,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  const raster = RASTER[k.e.layout];
  const bloecke = seite.bloecke
    .map((block) => {
      if (block.art === "ueberschrift") return ueberschrift(block, k);
      if (block.art === "angebot") return angebot(block, k);
      return k.e.layout === "liste" ? listenzeile(block, k) : kachel(block, k);
    })
    .join("\n");

  return `<section class="seite artikel" style="--ak:${akzent(seite.kategorieSlug)}">
    ${kopfzeile(seite.kategorie, akzent(seite.kategorieSlug), k, opt)}
    <div class="raster" style="grid-template-columns:repeat(${raster.spalten}, minmax(0, 1fr));grid-template-rows:repeat(${raster.einheiten}, minmax(0, 1fr));">
      ${k.e.layout === "liste" ? listenkopf(k, firma, staffelSpalten(seite, k)) : ""}
      ${bloecke}
    </div>
    ${fusszeile(seite.nummer, k, firma, opt)}
  </section>`;
}

function anschriftzeile(firma: KatalogFirma): string {
  return [firma.name, firma.strasse, firma.plzOrt, firma.telefon, firma.website]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
}

/**
 * Bis zu vier Fotos für die Titelseite des Prospekts: reduzierte Artikel
 * zuerst, dann die ersten der Zusammenstellung. Was vorn steht, ist das,
 * womit das Heft wirbt.
 */
function titelfotos(aufbau: KatalogAufbau, e: KatalogEinstellungen): string[] {
  const reduziert: string[] = [];
  const uebrige: string[] = [];
  for (const seite of aufbau.seiten) {
    for (const block of seite.bloecke) {
      if (block.art === "artikel" && block.artikel.bildUrl) {
        const istReduziert = katalogPreis(block.artikel, e.preisart)?.reduziert;
        (istReduziert ? reduziert : uebrige).push(block.artikel.bildUrl);
      } else if (block.art === "angebot" && block.bildUrl && !block.fortsetzung) {
        uebrige.push(block.bildUrl);
      }
    }
  }
  return [...reduziert, ...uebrige].slice(0, 4);
}

/** Zahl der reduzierten Artikel und höchste Ersparnis – für den Stempel der Titelseite. */
function aktionen(
  aufbau: KatalogAufbau,
  e: KatalogEinstellungen,
): { anzahl: number; hoechste: number } {
  let anzahl = 0;
  let hoechste = 0;
  if (!e.zeigeKennzeichen || e.preisart === "ohne") return { anzahl, hoechste };
  const zaehle = (a: KatalogArtikel) => {
    const r = katalogPreis(a, e.preisart)?.reduziert;
    if (!r) return;
    anzahl++;
    hoechste = Math.max(hoechste, r.prozent);
  };
  for (const seite of aufbau.seiten) {
    for (const block of seite.bloecke) {
      if (block.art === "artikel") zaehle(block.artikel);
      else if (block.art === "angebot" && !block.fortsetzung) block.ausfuehrungen.forEach(zaehle);
    }
  }
  return { anzahl, hoechste };
}

function titelseite(
  aufbau: KatalogAufbau,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  const logo = opt.logo ? `<img class="logo" src="${esc(opt.logo)}" alt="LIDER">` : `<div class="logo-text">LIDER</div>`;

  if (k.prospekt) {
    const fotos = titelfotos(aufbau, k.e);
    const aktion = aktionen(aufbau, k.e);
    return `<section class="seite titel prospekt-titel">
      <div class="oben">${logo}</div>
      <div class="band">
        <h1>${esc(k.e.title)}</h1>
        ${k.e.subtitle ? `<p>${esc(k.e.subtitle)}</p>` : ""}
        ${
          aktion.anzahl > 0
            ? `<div class="stempel"><u>${aktion.anzahl === 1 ? "reduziert" : "reduzierte Artikel bis"}</u><b>−${aktion.hoechste}</b><i>%</i></div>`
            : ""
        }
      </div>
      <div class="auslage n${fotos.length}">${fotos.map((url) => `<div>${foto(url, 640)}</div>`).join("")}</div>
      <div class="unten">${anschriftzeile(firma)}</div>
    </section>`;
  }

  return `<section class="seite titel">
    <div class="oben">${logo}</div>
    <div class="mitte">
      <h1>${esc(k.e.title)}</h1>
      <div class="strich"></div>
      ${k.e.subtitle ? `<p>${esc(k.e.subtitle)}</p>` : ""}
      <p class="stand">Stand ${esc(formatDate(opt.stand))}</p>
    </div>
    <div class="unten">${anschriftzeile(firma)}</div>
  </section>`;
}

function inhaltsseite(
  inhalt: NonNullable<KatalogAufbau["inhalt"]>,
  slugs: Map<string, string>,
  nummer: number,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  return `<section class="seite artikel">
    ${kopfzeile("Inhalt", BLAU, k, opt)}
    <div class="inhalt">
      ${inhalt.map((zeile) => `<div><em style="${k.prospekt ? "background:" + akzent(slugs.get(zeile.kategorie) ?? "") : ""}"></em><span>${esc(zeile.kategorie)}</span><i></i><span>${zeile.seite}</span></div>`).join("")}
    </div>
    ${fusszeile(nummer, k, firma, opt)}
  </section>`;
}

function rueckseite(
  aufbau: KatalogAufbau,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  const wege: [string, string][] = [];
  if (firma.website) {
    wege.push([
      "Kundenportal",
      `${firma.website} – Sortiment, Preise und Bestellung rund um die Uhr`,
    ]);
  }
  if (firma.telefon) wege.push(["Telefon", firma.telefon]);
  if (firma.email) wege.push(["E-Mail", firma.email]);
  if (aufbau.seiten.some((x) => x.kategorieSlug === BALD_SLUG)) {
    wege.push([
      "Vorbestellung",
      "Artikel aus „Bald im Sortiment“ nehmen wir ab sofort entgegen. Geliefert wird, sobald die Ware bei uns eingetroffen ist.",
    ]);
  }
  if (firma.strasse || firma.plzOrt) {
    wege.push([
      "Abholung",
      [firma.strasse, firma.plzOrt].filter(Boolean).join(", "),
    ]);
  }

  const hinweis = [
    preishinweis(k.e, firma),
    `Stand ${formatDate(opt.stand)}.`,
    k.e.preisart === "ohne"
      ? "Abbildungen ähnlich. Irrtümer vorbehalten."
      : "Abbildungen ähnlich. Irrtümer und Preisänderungen vorbehalten. Solange der Vorrat reicht.",
  ]
    .filter(Boolean)
    .join(" ");

  return `<section class="seite rueck${k.prospekt ? " prospekt-rueck" : ""}">
    <div class="oben">${opt.logo ? `<img class="logo" src="${esc(opt.logo)}" alt="LIDER">` : `<div class="logo-text">LIDER</div>`}</div>
    <div class="block">
      <h2>Bestellung und Kontakt</h2>
      <div class="strich"></div>
      <table>${wege.map(([was, wie]) => `<tr><th>${esc(was)}</th><td>${esc(wie)}</td></tr>`).join("")}</table>
      ${k.e.rueckseiteText ? `<p class="frei">${esc(k.e.rueckseiteText)}</p>` : ""}
    </div>
    <div class="unten">
      <p>${esc(hinweis)}</p>
      <p>${anschriftzeile(firma)}</p>
    </div>
  </section>`;
}

// --- Dokument ----------------------------------------------------------------

/**
 * Vollständiges HTML-Dokument des Katalogs.
 *
 * Der Aufrufer stellt sicher, dass der Aufbau Seiten hat – für den leeren
 * Katalog gibt es buildKatalogHinweisHtml().
 */
export function buildKatalogHtml(
  aufbau: KatalogAufbau,
  e: KatalogEinstellungen,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  const k: Kontext = { e, prospekt: e.stil === "prospekt" };
  const u = einheitMm(e.layout);

  const seiten: string[] = [];
  if (e.mitTitelseite) seiten.push(titelseite(aufbau, k, firma, opt));
  if (aufbau.inhalt) {
    seiten.push(
      inhaltsseite(
        aufbau.inhalt,
        new Map(aufbau.seiten.map((x) => [x.kategorie, x.kategorieSlug])),
        e.mitTitelseite ? 2 : 1,
        k,
        firma,
        opt,
      ),
    );
  }
  for (const seite of aufbau.seiten) {
    seiten.push(artikelseite(seite, k, firma, opt));
  }
  if (e.mitRueckseite) seiten.push(rueckseite(aufbau, k, firma, opt));

  // Zeilenhöhen der geklemmten Texte, in mm – daraus folgen die festen Höhen
  // der Felder, die auch leer ihren Platz behalten.
  const zl = { klein: 2.9, name: 3.7, nameGross: 4.5 };

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${esc(e.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${SCHRIFT};
    font-size: 8.5pt;
    line-height: 1.3;
    color: #000;
    background: #e5e7eb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-variant-numeric: tabular-nums;
  }
  img { display: block; }
  s { color: ${GRAU}; font-weight: 400; }

  /* --- Leiste am Bildschirm ------------------------------------------- */
  .leiste {
    position: sticky; top: 0; z-index: 5;
    display: flex; align-items: center; gap: 16px;
    padding: 10px 20px;
    background: #fff; border-bottom: 1px solid #d1d5db;
    font-size: 13px;
  }
  .leiste b { font-weight: 600; white-space: nowrap; }
  .leiste button { white-space: nowrap; }
  .leiste span { color: ${GRAU}; }
  .leiste button {
    margin-left: auto; padding: 7px 14px;
    font: inherit; font-weight: 600; color: #fff;
    background: ${BLAU}; border: 0; cursor: pointer;
  }

  /* --- Blatt ---------------------------------------------------------- */
  .seite {
    --ak: ${BLAU};
    position: relative;
    width: ${mm(SEITE.breite)}; height: ${mm(SEITE.hoehe)};
    padding: ${mm(RAND)};
    margin: 16px auto;
    background: #fff;
    overflow: hidden;
    break-after: page;
  }
  .seite:last-child { break-after: auto; }

  .kopf {
    display: flex; align-items: center; justify-content: space-between;
    position: relative;
    height: ${mm(KOPF.hoehe)}; margin-bottom: ${mm(KOPF.abstand)};
    border-bottom: 1.6pt solid ${BLAU};
  }
  .kopf .gruppe {
    font-size: 17pt; font-weight: 800; color: ${NAVY};
    letter-spacing: -0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .kopf .marke { display: flex; align-items: center; gap: 2.2mm; flex: none; padding-bottom: 1.2mm; }
  .kopf .marke .wappen { height: 8.2mm; width: auto; }
  .kopf .marke .wort { height: 5.6mm; width: auto; }
  .kopf .marke b { font-size: 12pt; font-weight: 800; letter-spacing: 0.1em; color: ${ROT}; }

  .fuss {
    display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm;
    height: ${mm(FUSS.hoehe)}; margin-top: ${mm(FUSS.abstand)};
    border-top: 0.25pt solid ${LINIE};
    font-size: 6.5pt; color: ${GRAU};
    white-space: nowrap;
  }
  .fuss span:last-child { font-size: 10pt; font-weight: 800; color: ${NAVY}; line-height: 1; }

  .raster { display: grid; height: ${mm(NUTZ.hoehe)}; }
  .zelle { min-width: 0; min-height: 0; overflow: hidden; }

  .foto { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .foto img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
  /* Foto auf grauem Grund: multiply lässt den weißen Fotohintergrund darin
     verschwinden, die Ware steht frei auf der Fläche. */
  .kachel .foto, .angebot > .foto, .zeile .foto { background: ${FLAECHE}; }
  .kachel .foto { padding: 1.8mm; }
  .angebot > .foto, .zeile .foto { padding: 1mm; }
  .foto img { mix-blend-mode: multiply; }

  .name { font-weight: 700; color: ${NAVY}; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .nr, .merk, .text, .staffel { font-size: 6.5pt; line-height: ${mm(zl.klein)}; color: ${GRAU}; overflow: hidden; }
  .nr, .merk, .staffel { white-space: nowrap; text-overflow: ellipsis; }
  .text { display: -webkit-box; -webkit-box-orient: vertical; }
  .staffel b { color: #000; font-weight: 600; }

  .kz {
    display: inline-block; padding: 0 1.4mm;
    font-size: 6.2pt; font-weight: 700; line-height: 3.3mm;
    letter-spacing: 0.02em;
    background: ${BLAU}; color: #fff;
  }
  .kz.top { background: ${GOLD}; }
  .kz.akt { background: ${ROT}; }
  .kz.bald { background: ${GOLD}; }
  .prozent {
    position: absolute; top: 0; right: 0;
    display: flex; align-items: baseline;
    padding: 1mm 2.2mm 1.1mm;
    background: ${ROT}; color: #fff; line-height: 1;
  }
  .prozent b { font-size: 16pt; font-weight: 800; letter-spacing: -0.02em; }
  .prozent i { font-style: normal; font-size: 10pt; font-weight: 700; margin-left: 0.3mm; }
  .prozent u { text-decoration: none; font-size: 6.5pt; font-weight: 600; margin-right: 1mm; }

  .bestand {
    position: absolute; left: 0; bottom: 0;
    padding: 0 1.6mm; background: #fff; color: ${NAVY};
    font-size: 6.5pt; font-weight: 700; line-height: 3.6mm; white-space: nowrap;
  }
  .bestand.aus { background: ${GRAU}; color: #fff; }
  .aust td.bst { font-size: 7.5pt; color: ${GRAU}; text-align: right; }

  .bc { display: inline-flex; flex-direction: column; align-items: center; background: #fff; }
  .bc svg { display: block; }
  .bc path { fill: #000; }
  .bcz { font-size: 4.8pt; line-height: 1.9mm; letter-spacing: 0.08em; color: #000; }

  .preis { text-align: right; white-space: nowrap; }
  .preis .pz { font-size: 6.5pt; line-height: ${mm(zl.klein)}; height: ${mm(zl.klein)}; color: ${GRAU}; }
  .preis .pz b { color: ${ROT}; font-weight: 600; }
  .preis .pb { font-size: 13pt; font-weight: 800; line-height: 1.15; color: ${NAVY}; letter-spacing: -0.01em; }
  .red .pb, .red > b, td.red b { color: ${ROT}; }

  /* --- Kacheln und Groß ----------------------------------------------- */
  /* Quadratisches Foto über die ganze Zellbreite, darunter alles, was zum
     Artikel gehört, ohne Lücke. Feste Höhen: der Umbruch ist gerechnet. */
  .kachel { display: flex; flex-direction: column; padding: 0 2mm; }
  .kachel .foto { flex: none; width: 100%; aspect-ratio: 1 / 1; margin-bottom: 1.2mm; padding: 1.5mm; }
  .marken { position: absolute; top: 0; left: 0; }
  .kachel .marken { position: absolute; top: 0; left: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 0.6mm; }
  .kachel .name { flex: none; font-size: 8.5pt; line-height: ${mm(zl.name - 0.2)}; height: ${mm((zl.name - 0.2) * 2)}; }
  .kachel .nr { flex: none; height: ${mm(zl.klein)}; }
  .kachel .kaufen { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 2mm; height: 9.2mm; margin-top: 0.6mm; }
  .kachel .preis { text-align: left; }
  .kachel .code { flex: none; display: flex; justify-content: flex-end; }
  .kachel .staffel { flex: none; height: ${mm(zl.klein)}; margin-top: 0.2mm; white-space: nowrap; }

  .l-gross .kachel { padding: 0 2.5mm; }
  .l-gross .kachel .foto { margin-bottom: 1.8mm; padding: 2.5mm; }
  .l-gross .kachel .name { font-size: 11pt; line-height: ${mm(zl.nameGross)}; height: ${mm(zl.nameGross * 2)}; }
  .l-gross .kachel .nr { font-size: 7.5pt; }
  .l-gross .kachel .kaufen { height: 12mm; margin-top: 1mm; }
  .l-gross .preis .pb { font-size: 20pt; }
  .staffeln { flex: none; height: ${mm(3.2 * 3)}; margin: 1mm 0 0; border-collapse: collapse; font-size: 7.5pt; display: block; }
  .staffeln td { padding: 0 4mm 0 0; line-height: 3.2mm; white-space: nowrap; }
  .staffeln td:first-child { color: ${GRAU}; }
  .staffeln td:last-child { font-weight: 700; color: ${NAVY}; padding-right: 0; }

  /* --- Liste ---------------------------------------------------------- */
  .zeile {
    display: flex; align-items: center; gap: 3mm;
    border-bottom: 0.25pt solid ${LINIE};
  }
  .zeile .foto { flex: none; width: 11mm; height: ${mm(u * 2 - 1.4)}; }
  .zeile .angaben { flex: 1 1 0; min-width: 0; }
  .zeile .name { font-size: 8.5pt; line-height: ${mm(zl.name)}; max-height: ${mm(zl.name * 2)}; }
  .zeile .name.einzeilig { -webkit-line-clamp: 1; }
  .zeile .name .kz { margin-left: 1.5mm; vertical-align: 0.2mm; }
  .zeile .text { -webkit-line-clamp: 1; }
  .zeile .code { flex: none; width: 32mm; display: flex; justify-content: center; }
  .lp { flex: none; width: 21mm; display: flex; flex-direction: column; align-items: flex-end; white-space: nowrap; }
  .lp .pz { font-size: 6pt; line-height: 2.7mm; height: 2.7mm; color: ${GRAU}; }
  .lp .pz b { color: ${ROT}; font-weight: 600; }
  .lp .pb { font-size: 9.5pt; font-weight: 800; line-height: 1.2; color: ${NAVY}; }
  .pa-laden .lp { width: 30mm; }

  /* --- Spaltenköpfe der Liste ----------------------------------------- */
  .listenkopf {
    display: flex; align-items: center; gap: 3mm;
    background: var(--ak); color: #fff;
    font-size: 6.8pt; font-weight: 700;
    margin-bottom: 0.8mm; min-height: 0; overflow: hidden; white-space: nowrap;
  }
  .listenkopf .kf { flex: none; width: 11mm; }
  .listenkopf .ka { flex: 1 1 0; min-width: 0; }
  .listenkopf .kc { flex: none; width: 32mm; text-align: center; }
  .listenkopf .kp { flex: none; text-align: right; }
  .listenkopf .p1s { width: 21mm; }
  .listenkopf .p1 { width: 30mm; }

  /* Ohne Foto steht dort nichts – keine graue Fläche, die ein Bild vortäuscht. */
  .zelle .foto.leer { background: none !important; outline: 0 !important; }

  /* --- Ausführungs-Angebot -------------------------------------------- */
  .angebot {
    display: flex; gap: 4mm;
    padding: ${mm(ANGEBOT_RAND_MM / 2)} 0;
    border-bottom: 0.25pt solid ${LINIE};
  }
  .angebot > .foto { flex: none; width: ${mm(ANGEBOT_FOTO_MM)}; height: ${mm(ANGEBOT_FOTO_MM)}; align-self: flex-start; }
  .angebot.in-liste { gap: 3mm; padding: 0; }
  .angebot.in-liste > .foto { width: 11mm; height: ${mm(u * 2 - 1.4)}; margin-top: 0.7mm; }
  .angebot .rechts { flex: 1 1 0; min-width: 0; }
  .angebot .titelzeile { display: flex; flex-direction: column; justify-content: center; }
  .angebot .name { font-size: 11.5pt; line-height: 4.6mm; -webkit-line-clamp: 1; }
  .angebot.in-liste .name { font-size: 8.5pt; }
  .angebot .text { -webkit-line-clamp: 1; }
  .forts { font-size: 6.5pt; font-weight: 400; color: ${GRAU}; }
  .aust { width: 100%; border-collapse: collapse; table-layout: auto; }
  .aust th, .aust td { padding: 0 0 0 2mm; text-align: left; vertical-align: middle; white-space: nowrap; border-top: 0.25pt solid ${LINIE}; }
  .aust th:first-child, .aust td:first-child { padding-left: 0; }
  .aust th { font-size: 6.5pt; font-weight: 700; color: #fff; background: ${BLAU}; padding: 0 2mm; }
  .aust td { font-size: 8pt; }
  .aust td.aus { width: 99%; max-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 700; color: ${NAVY}; }
  .aust tr:nth-child(even) td { background: ${FLAECHE}; }
  .aust td.r b { font-weight: 800; color: ${NAVY}; }
  .aust td.nr { font-size: 7.5pt; line-height: inherit; color: ${GRAU}; }
  .aust .r { text-align: right; }
  .aust .pz { font-size: 6pt; color: ${GRAU}; }
  .aust td.code { line-height: 0; }

  /* --- Zwischenüberschrift -------------------------------------------- */
  .zwischen { display: flex; align-items: flex-end; border-bottom: 1.6pt solid ${BLAU}; padding-bottom: 1mm; }
  .zwischen span { font-size: 14pt; font-weight: 800; color: ${NAVY}; letter-spacing: -0.01em; }

  /* --- Inhalt --------------------------------------------------------- */
  .inhalt { height: ${mm(NUTZ.hoehe)}; padding-top: 8mm; }
  .inhalt div { display: flex; align-items: baseline; gap: 2mm; height: 10mm; font-size: 13pt; font-weight: 600; color: ${NAVY}; }
  .inhalt em { flex: none; align-self: center; width: 3.2mm; height: 3.2mm; background: ${BLAU}; }
  .inhalt i { flex: 1; border-bottom: 0.5pt dotted ${GRAU}; transform: translateY(-1mm); }
  .inhalt span:last-child { font-weight: 800; font-size: 15pt; }

  /* --- Titel- und Rückseite ------------------------------------------- */
  .titel, .rueck { display: flex; flex-direction: column; padding: 22mm 24mm 16mm; }
  .logo { width: 52mm; height: auto; }
  .logo-text { font-size: 30pt; font-weight: 700; letter-spacing: 0.14em; color: ${BLAU}; }
  .titel .mitte { margin-top: 62mm; }
  .titel h1 { margin: 0; font-size: 44pt; font-weight: 800; line-height: 1.05; color: ${NAVY}; letter-spacing: -0.02em; overflow-wrap: break-word; }
  .titel p.stand { margin-top: 5mm; font-size: 10pt; color: ${GRAU}; }
  /* Sachlich: blauer Rücken links, goldene Kante daneben. */
  .titel:not(.prospekt-titel)::before, .rueck:not(.prospekt-rueck)::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 9mm; background: ${BLAU}; }
  .titel:not(.prospekt-titel)::after, .rueck:not(.prospekt-rueck)::after { content: ""; position: absolute; left: 9mm; top: 0; bottom: 0; width: 1.2mm; background: ${GOLD}; }
  .titel:not(.prospekt-titel), .rueck:not(.prospekt-rueck) { padding-left: 32mm; }
  .strich { width: 26mm; height: 0; border-top: 1.5pt solid ${GOLD}; margin: 7mm 0 6mm; }
  .titel p { margin: 0; font-size: 15pt; color: #000; }
  .titel .unten, .rueck .unten { margin-top: auto; padding-top: 4mm; border-top: 0.25pt solid ${LINIE}; font-size: 8pt; color: ${GRAU}; }

  /* Titelseite Prospekt: das ganze Blatt Navy, Logo auf weißem Reiter,
     Fotoflächen laufen rechts und unten aus dem Papier. */
  .prospekt-titel { padding: 0; background: ${NAVY}; color: #fff; }
  .prospekt-titel .oben { align-self: flex-start; background: #fff; padding: 15mm 22mm 11mm 24mm; border-bottom: 2.5pt solid ${GOLD}; }
  .prospekt-titel .band { position: relative; padding: 20mm 24mm 14mm; }
  .prospekt-titel h1 { color: #fff; font-size: 58pt; font-weight: 800; line-height: 1; letter-spacing: -0.025em; max-width: 116mm; }
  .prospekt-titel p { margin-top: 6mm; font-size: 17pt; font-weight: 600; color: #e2a13f; }
  .prospekt-titel .stempel {
    position: absolute; right: 24mm; top: 20mm; width: 42mm; height: 42mm;
    display: flex; flex-wrap: wrap; align-content: center; justify-content: center; align-items: baseline;
    background: ${ROT}; color: #fff; text-align: center; line-height: 1;
  }
  .stempel u { flex: 0 0 100%; margin-bottom: 1.5mm; text-decoration: none; font-size: 7.5pt; font-weight: 600; }
  .stempel b { font-size: 34pt; font-weight: 800; letter-spacing: -0.03em; }
  .stempel i { font-style: normal; font-size: 18pt; font-weight: 700; margin-left: 0.5mm; }
  .prospekt-titel .auslage { flex: 1 1 0; min-height: 0; display: grid; grid-template-columns: repeat(2, 1fr); grid-auto-rows: 1fr; gap: 4mm; margin-left: 24mm; }
  .prospekt-titel .auslage.n1 { grid-template-columns: 1fr; }
  .prospekt-titel .auslage.n3 div:last-child { grid-column: 1 / -1; }
  .prospekt-titel .auslage div { min-height: 0; background: ${FLAECHE}; padding: 5mm; display: flex; }
  .prospekt-titel .auslage img { width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
  .prospekt-titel .unten { margin: 8mm 24mm 14mm; padding-top: 4mm; border-top: 0.25pt solid #3a4a70; color: #aab4cc; }

  .rueck .block { margin-top: 40mm; }
  .rueck h2 { margin: 0; font-size: 26pt; font-weight: 800; color: ${NAVY}; letter-spacing: -0.015em; }
  .rueck table { border-collapse: collapse; font-size: 11pt; }
  .rueck th, .rueck td { padding: 2.2mm 0; text-align: left; vertical-align: top; border-bottom: 0.25pt solid ${LINIE}; }
  .rueck th { width: 38mm; font-weight: 600; color: ${GRAU}; }
  .rueck .frei { margin: 10mm 0 0; max-width: 130mm; font-size: 10.5pt; line-height: 1.5; white-space: pre-line; }
  .rueck .unten p { margin: 0 0 1.5mm; }

  /* --- Prospekt: nur Farbe und Gewicht, keine anderen Maße ------------ */
  .s-prospekt .rueck { background: ${NAVY}; color: #fff; }
  .s-prospekt .rueck h2 { color: #fff; }
  .s-prospekt .rueck th { color: #aab4cc; }
  .s-prospekt .rueck th, .s-prospekt .rueck td { border-bottom-color: #3a4a70; }
  .s-prospekt .rueck .unten { border-top-color: #3a4a70; color: #aab4cc; }
  .s-prospekt .rueck .oben { background: #fff; margin: -22mm -24mm 0; padding: 22mm 24mm 12mm; }
  .s-prospekt .kz { background: ${NAVY}; }
  .s-prospekt .kz.top { background: ${GOLD}; }
  .s-prospekt .kz.akt { background: ${ROT}; }
  /* Prospekt: der Preis als Farbfeld direkt unter dem Artikel, in der Farbe
     der Warengruppe; reduziert in Rot. Das Foto liegt auf einem Hauch Farbe. */
  .s-prospekt .kachel .preis .pb { display: inline-flex; align-items: flex-start; padding: 0.3mm 2mm 0.5mm; background: var(--ak); color: #fff; font-size: 16pt; line-height: 1.05; }
  .s-prospekt .kachel.aktion .preis .pb { background: ${ROT}; }
  .s-prospekt .l-gross .kachel .preis .pb { font-size: 21pt; }
  .s-prospekt .kachel .foto, .s-prospekt .angebot > .foto { background: color-mix(in srgb, var(--ak) 9%, #fff); }
  .s-prospekt .artikel .kopf { border-bottom: 1.2mm solid var(--kf); }
  .s-prospekt .artikel .kopf .gruppe { color: var(--kf); font-size: 22pt; font-weight: 800; }
  .s-prospekt .fuss span:last-child { background: var(--ak); color: #fff; padding: 0.9mm 2.4mm; }
  .s-prospekt .kachel .cent { font-size: 0.52em; margin-left: 0.06em; }
  .s-prospekt .kachel .waehrung { font-size: 0.52em; margin-left: 0.12em; }
  .s-prospekt .zwischen { border-bottom: 0; padding: 0; align-items: stretch; }
  .s-prospekt .zwischen span { flex: 1; display: flex; align-items: center; padding: 0 4mm; margin: 1.2mm 0; color: #fff; font-weight: 800; }
  .s-prospekt .aust th { background: var(--ak); }

  @media print {
    body { background: #fff; }
    .leiste { display: none; }
    .seite { margin: 0; }
  }
</style>
</head>
<body class="s-${esc(e.stil)} pa-${esc(e.preisart)}">
  <div class="leiste">
    <b>${esc(e.title)}</b>
    <span>${seiten.length} Seiten · ${aufbau.gedruckt} Artikel · im Druckdialog „Als PDF sichern“ wählen, Ränder „Keine“, Hintergrundgrafiken an</span>
    <button type="button" onclick="window.print()">Drucken / PDF</button>
  </div>
  <main class="l-${esc(e.layout)}">
${seiten.join("\n")}
  </main>
  <script>
    (function () {
      var bilder = Array.prototype.slice.call(document.images);
      var offen = bilder.length;
      var fertig = false;

      function los() {
        if (fertig) return;
        fertig = true;
        ${opt.autoPrint ? "window.setTimeout(function () { window.print(); }, 200);" : ""}
      }
      function eins() { offen--; if (offen <= 0) los(); }

      bilder.forEach(function (bild) {
        // Verweigert der Bildoptimierer die Adresse, einmal das Original
        // versuchen. Scheitert auch das, bleibt die Zelle weiß.
        bild.addEventListener("error", function () {
          var roh = bild.getAttribute("data-roh");
          if (roh && bild.getAttribute("src") !== roh) { bild.setAttribute("src", roh); return; }
          bild.style.visibility = "hidden";
          eins();
        });
        bild.addEventListener("load", eins);
        if (bild.complete && bild.naturalWidth > 0) eins();
      });

      if (offen <= 0) los();
      // Ein hängendes Foto darf den Druck nicht aufhalten.
      window.setTimeout(los, 15000);
    })();
  </script>
</body>
</html>`;
}

/**
 * Schlichte Hinweisseite statt eines leeren Blatts – wenn der Katalog nichts
 * Druckbares enthält. Der Druckdialog bleibt zu.
 */
export function buildKatalogHinweisHtml(titel: string, gruende: string[]): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>${esc(titel)}</title>
<style>
  body { margin: 0; padding: 48px 24px; font-family: ${SCHRIFT}; font-size: 15px; line-height: 1.5; color: #111827; background: #f3f4f6; }
  div { max-width: 520px; margin: 0 auto; padding: 28px 32px; background: #fff; border: 1px solid #d1d5db; }
  h1 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  p { margin: 0 0 12px; color: #4b5563; }
  ul { margin: 0; padding-left: 20px; }
</style>
</head>
<body>
  <div>
    <h1>${esc(titel)}</h1>
    <p>In diesem Katalog steht nichts, was sich drucken lässt.</p>
    ${gruende.length > 0 ? `<ul>${gruende.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
  </div>
</body>
</html>`;
}

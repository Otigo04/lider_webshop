import { accentIndex } from "@/lib/accent-colors";
import { barcode as strichcode, MODUL_MIN, MODUL_NENN } from "@/lib/barcode";
import { formatDate, formatPrice } from "@/lib/format";
import {
  ANGEBOT_KOPF_MM,
  FUSS,
  KOPF,
  NUTZ,
  RAND,
  RASTER,
  SEITE,
  ausfuehrungMm,
  ausfuehrungName,
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

/** Die sechs Warengruppenfarben (--tag-N-fg), für das Kopfband im Prospekt. */
const AKZENT = ["#283f78", "#0f5f57", "#9a4310", "#9c1f47", "#4c2f96", "#1c6b34"];

function akzent(slug: string): string {
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
  if (artikel.neu) teile.push(`<span class="kz neu">Neu</span>`);
  if (artikel.topseller) teile.push(`<span class="kz top">Topseller</span>`);
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
        ? ` <s>${esc(formatPrice(reduziert.vorher))}</s>${k.prospekt ? "" : ` <b>−${reduziert.prozent} %</b>`}`
        : ""
    }</div>
    <div class="pb">${betrag}</div>
  </div>`;
}

/** Rotes Prozentfeld auf dem Foto – nur im Prospekt. */
function prozentfeld(preis: KatalogPreis | null, k: Kontext): string {
  if (!k.prospekt || !k.e.zeigeKennzeichen || !preis?.reduziert) return "";
  return `<span class="prozent">−${preis.reduziert.prozent} %</span>`;
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
  const innen = NUTZ.breite / RASTER[k.e.layout].spalten - 5;

  // Im großen Raster steht die volle Staffeltabelle, in der Kachel die
  // Nebenzeile – dort ist für eine Tabelle kein Platz.
  const staffeln =
    k.e.preisart !== "grosshandel"
      ? ""
      : gross
        ? `<table class="staffeln">${(preis?.staffeln.length ?? 0) > 1 ? kuerze(preis!.staffeln, 4).map((s) => `<tr><td>${esc(mengenangabe(s.ab))}</td><td>${esc(formatPrice(s.preis))}</td></tr>`).join("") : ""}</table>`
        : `<div class="staffel">${staffelzeile(preis)}</div>`;

  return `<div class="zelle kachel" style="${platz(block)}">
    <div class="foto">${foto(a.bildUrl, gross ? 828 : 640)}<div class="marken">${kennzeichen(a, k)}</div>${prozentfeld(preis, k)}</div>
    <div class="name">${esc(a.name)}</div>
    <div class="nr">Art.-Nr. ${esc(a.sku)}</div>
    ${k.e.zeigeMerkmale ? `<div class="merk">${esc(merkmalText(a))}</div>` : ""}
    ${k.e.zeigeBeschreibung ? `<div class="text">${esc(a.beschreibung ?? "")}</div>` : ""}
    ${gross ? staffeln : ""}
    <div class="unten">
      <div class="code">${k.e.zeigeBarcode ? strichbild(a.barcode, innen * (gross ? 0.5 : 0.56), gross ? 8 : 6) : ""}</div>
      ${preisblock(preis, k)}
    </div>
    ${gross ? "" : staffeln}
  </div>`;
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
        <span class="pz">${esc(mengenangabe(s.ab))}${rot ? ` <s>${esc(formatPrice(reduziert.vorher))}</s>` : ""}</span>
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
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="zelle zeile" style="${platz(block)}">
    <div class="foto">${foto(a.bildUrl, 256)}</div>
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

  const kopfzeile = liste
    ? ""
    : `<tr class="th" style="height:${mm(zeilenhoehe)}">
        <th>Ausführung</th><th>Art.-Nr.</th>${k.e.zeigeBarcode ? "<th>EAN</th>" : ""}${Array.from(
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
        return `<td class="r${rot ? " red" : ""}">${einheitlich ? "" : `<span class="pz">${esc(mengenangabe(s.ab))}</span> `}${rot ? `<s>${esc(formatPrice(reduziert.vorher))}</s> ` : ""}<b>${esc(formatPrice(s.preis))}</b></td>`;
      }).join("");

      return `<tr style="height:${mm(zeilenhoehe)}">
        <td class="aus">${esc(ausfuehrungName(a))}</td>
        <td class="nr">${esc(a.sku)}</td>
        ${k.e.zeigeBarcode ? `<td class="code">${strichbild(a.barcode, 31, zeilenhoehe - 4)}</td>` : ""}
        ${zellen}
      </tr>`;
    })
    .join("");

  return `<div class="zelle angebot${liste ? " in-liste" : ""}" style="${platz(block)}">
    <div class="foto">${foto(block.bildUrl, liste ? 256 : 640)}</div>
    <div class="rechts">
      <div class="kopf" style="height:${mm(kopfhoehe)}">
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
  return `<header class="kopf" style="${k.prospekt ? `background:${farbe};` : ""}">
    <span class="gruppe">${esc(links)}</span>
    <span class="marke">${opt.wappen && !k.prospekt ? `<img src="${esc(opt.wappen)}" alt="">` : ""}<span><b>LIDER</b><i>Groß- und Einzelhandel</i></span></span>
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

  return `<section class="seite artikel">
    ${kopfzeile(seite.kategorie, akzent(seite.kategorieSlug), k, opt)}
    <div class="raster" style="grid-template-columns:repeat(${raster.spalten}, minmax(0, 1fr));grid-template-rows:repeat(${raster.einheiten}, minmax(0, 1fr));">
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

function titelseite(
  aufbau: KatalogAufbau,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  const logo = opt.logo ? `<img class="logo" src="${esc(opt.logo)}" alt="LIDER">` : `<div class="logo-text">LIDER</div>`;

  if (k.prospekt) {
    const fotos = titelfotos(aufbau, k.e);
    return `<section class="seite titel prospekt-titel">
      <div class="oben">${logo}</div>
      <div class="band">
        <h1>${esc(k.e.title)}</h1>
        ${k.e.subtitle ? `<p>${esc(k.e.subtitle)}</p>` : ""}
      </div>
      <div class="auslage">${fotos.map((url) => `<div>${foto(url, 640)}</div>`).join("")}</div>
      <div class="unten">${anschriftzeile(firma)}</div>
    </section>`;
  }

  return `<section class="seite titel">
    <div class="oben">${logo}</div>
    <div class="mitte">
      <h1>${esc(k.e.title)}</h1>
      <div class="strich"></div>
      ${k.e.subtitle ? `<p>${esc(k.e.subtitle)}</p>` : ""}
    </div>
    <div class="unten">${anschriftzeile(firma)}</div>
  </section>`;
}

function inhaltsseite(
  inhalt: NonNullable<KatalogAufbau["inhalt"]>,
  nummer: number,
  k: Kontext,
  firma: KatalogFirma,
  opt: KatalogBogenOptions,
): string {
  return `<section class="seite artikel">
    ${kopfzeile("Inhalt", BLAU, k, opt)}
    <div class="inhalt">
      ${inhalt.map((zeile) => `<div><span>${esc(zeile.kategorie)}</span><i></i><span>${zeile.seite}</span></div>`).join("")}
    </div>
    ${fusszeile(nummer, k, firma, opt)}
  </section>`;
}

function rueckseite(
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

  return `<section class="seite rueck">
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
      inhaltsseite(aufbau.inhalt, e.mitTitelseite ? 2 : 1, k, firma, opt),
    );
  }
  for (const seite of aufbau.seiten) {
    seiten.push(artikelseite(seite, k, firma, opt));
  }
  if (e.mitRueckseite) seiten.push(rueckseite(k, firma, opt));

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
  .leiste b { font-weight: 600; }
  .leiste span { color: ${GRAU}; }
  .leiste button {
    margin-left: auto; padding: 7px 14px;
    font: inherit; font-weight: 600; color: #fff;
    background: ${BLAU}; border: 0; cursor: pointer;
  }

  /* --- Blatt ---------------------------------------------------------- */
  .seite {
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
    height: ${mm(KOPF.hoehe)}; margin-bottom: ${mm(KOPF.abstand)};
    border-bottom: 0.8pt solid ${BLAU};
  }
  .kopf .gruppe {
    font-size: 11pt; font-weight: 600; color: ${BLAU};
    letter-spacing: 0.06em; text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .kopf .marke { display: flex; align-items: center; gap: 2mm; color: ${BLAU}; }
  .kopf .marke img { height: 8mm; width: 8mm; object-fit: contain; }
  .kopf .marke span { display: flex; flex-direction: column; line-height: 1.1; }
  .kopf .marke b { font-size: 11pt; font-weight: 700; letter-spacing: 0.12em; }
  .kopf .marke i { font-style: normal; font-size: 5.6pt; color: ${GRAU}; letter-spacing: 0.02em; }

  .fuss {
    display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm;
    height: ${mm(FUSS.hoehe)}; margin-top: ${mm(FUSS.abstand)};
    border-top: 0.25pt solid ${LINIE};
    font-size: 6.5pt; color: ${GRAU};
    white-space: nowrap;
  }

  .raster { display: grid; height: ${mm(NUTZ.hoehe)}; }
  .zelle { min-width: 0; min-height: 0; overflow: hidden; }

  .foto { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; }
  .foto img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }

  .name { font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .nr, .merk, .text, .staffel { font-size: 6.5pt; line-height: ${mm(zl.klein)}; color: ${GRAU}; overflow: hidden; }
  .nr, .merk, .staffel { white-space: nowrap; text-overflow: ellipsis; }
  .text { display: -webkit-box; -webkit-box-orient: vertical; }
  .staffel b { color: #000; font-weight: 600; }

  .kz {
    display: inline-block; padding: 0 1.2mm;
    font-size: 5.6pt; font-weight: 600; line-height: 3.1mm;
    letter-spacing: 0.08em; text-transform: uppercase;
    border: 0.5pt solid #000; background: #fff; color: #000;
  }
  .prozent {
    position: absolute; top: 0; right: 0;
    padding: 0.6mm 1.8mm;
    font-size: 10pt; font-weight: 700; line-height: 1.2;
    background: ${ROT}; color: #fff;
  }

  .bc { display: inline-flex; flex-direction: column; align-items: center; background: #fff; }
  .bc svg { display: block; }
  .bc path { fill: #000; }
  .bcz { font-size: 4.8pt; line-height: 1.9mm; letter-spacing: 0.08em; color: #000; }

  .preis { text-align: right; white-space: nowrap; }
  .preis .pz { font-size: 6.5pt; line-height: ${mm(zl.klein)}; height: ${mm(zl.klein)}; color: ${GRAU}; }
  .preis .pz b { color: ${ROT}; font-weight: 600; }
  .preis .pb { font-size: 12pt; font-weight: 700; line-height: 1.15; }
  .red .pb, .red > b, td.red b { color: ${ROT}; }

  /* --- Kacheln und Groß ----------------------------------------------- */
  .kachel {
    display: flex; flex-direction: column;
    padding: 2mm 2.5mm;
    border-bottom: 0.25pt solid ${LINIE};
    border-right: 0.25pt solid ${LINIE};
  }
  .kachel .foto { flex: 1 1 0; margin-bottom: 1.4mm; }
  .kachel .marken { position: absolute; top: 0; left: 0; display: flex; gap: 1mm; }
  .kachel .name { font-size: 8.5pt; line-height: ${mm(zl.name)}; height: ${mm(zl.name * 2)}; flex: none; }
  .kachel .nr, .kachel .merk { height: ${mm(zl.klein)}; flex: none; }
  .kachel .text { -webkit-line-clamp: 2; height: ${mm(zl.klein * 2)}; flex: none; margin-top: 0.4mm; }
  .kachel .unten { display: flex; align-items: flex-end; justify-content: space-between; gap: 2mm; height: 9.5mm; flex: none; margin-top: 0.8mm; }
  .kachel .staffel { height: ${mm(zl.klein)}; flex: none; margin-top: 0.6mm; text-align: right; }

  .l-gross .kachel { padding: 3mm 3.5mm; }
  .l-gross .kachel .name { font-size: 10.5pt; line-height: ${mm(zl.nameGross)}; height: ${mm(zl.nameGross * 2)}; }
  .l-gross .kachel .text { -webkit-line-clamp: 4; height: ${mm(zl.klein * 4)}; }
  .l-gross .kachel .unten { height: 12mm; }
  .l-gross .preis .pb { font-size: 15pt; }
  .staffeln { flex: none; height: ${mm(3.2 * 4)}; margin: 1mm 0 0 auto; border-collapse: collapse; font-size: 7.5pt; display: block; }
  .staffeln td { padding: 0 0 0 4mm; line-height: 3.2mm; text-align: right; white-space: nowrap; }
  .staffeln td:first-child { color: ${GRAU}; padding-left: 0; }
  .staffeln td:last-child { font-weight: 600; }

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
  .lp .pb { font-size: 9.5pt; font-weight: 700; line-height: 1.2; }
  .pa-laden .lp { width: 30mm; }

  /* --- Ausführungs-Angebot -------------------------------------------- */
  .angebot {
    display: flex; gap: 4mm;
    padding: 1.5mm 0;
    border-bottom: 0.25pt solid ${LINIE};
  }
  .angebot > .foto { flex: none; width: 40mm; align-self: flex-start; height: 100%; max-height: 40mm; }
  .angebot.in-liste { gap: 3mm; padding: 0; }
  .angebot.in-liste > .foto { width: 11mm; height: ${mm(u * 2 - 1.4)}; margin-top: 0.7mm; }
  .angebot .rechts { flex: 1 1 0; min-width: 0; }
  .angebot .kopf {
    display: flex; flex-direction: column; justify-content: center;
    height: auto; margin: 0; border: 0;
  }
  .angebot .name { font-size: 10pt; line-height: 4.2mm; -webkit-line-clamp: 1; }
  .angebot.in-liste .name { font-size: 8.5pt; }
  .angebot .text { -webkit-line-clamp: 1; }
  .forts { font-size: 6.5pt; font-weight: 400; color: ${GRAU}; letter-spacing: 0.04em; text-transform: uppercase; }
  .aust { width: 100%; border-collapse: collapse; table-layout: auto; }
  .aust th, .aust td { padding: 0 0 0 3mm; text-align: left; vertical-align: middle; white-space: nowrap; border-top: 0.25pt solid ${LINIE}; }
  .aust th:first-child, .aust td:first-child { padding-left: 0; }
  .aust th { font-size: 6pt; font-weight: 600; color: ${GRAU}; letter-spacing: 0.06em; text-transform: uppercase; }
  .aust td { font-size: 8pt; }
  .aust td.aus { width: 99%; max-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  .aust td.nr { font-size: 7.5pt; line-height: inherit; color: ${GRAU}; }
  .aust .r { text-align: right; }
  .aust .pz { font-size: 6pt; color: ${GRAU}; }
  .aust td.code { line-height: 0; }

  /* --- Zwischenüberschrift -------------------------------------------- */
  .zwischen { display: flex; align-items: flex-end; border-bottom: 0.8pt solid ${BLAU}; padding-bottom: 1mm; }
  .zwischen span { font-size: 10pt; font-weight: 600; color: ${BLAU}; letter-spacing: 0.06em; text-transform: uppercase; }

  /* --- Inhalt --------------------------------------------------------- */
  .inhalt { height: ${mm(NUTZ.hoehe)}; padding-top: 8mm; }
  .inhalt div { display: flex; align-items: baseline; gap: 2mm; height: 9mm; font-size: 11pt; }
  .inhalt i { flex: 1; border-bottom: 0.5pt dotted ${GRAU}; transform: translateY(-1mm); }
  .inhalt span:last-child { font-weight: 600; }

  /* --- Titel- und Rückseite ------------------------------------------- */
  .titel, .rueck { display: flex; flex-direction: column; padding: 22mm 24mm 16mm; }
  .logo { width: 52mm; height: auto; }
  .logo-text { font-size: 30pt; font-weight: 700; letter-spacing: 0.14em; color: ${BLAU}; }
  .titel .mitte { margin-top: 62mm; }
  .titel h1 { margin: 0; font-size: 36pt; font-weight: 600; line-height: 1.1; color: ${BLAU}; letter-spacing: -0.005em; overflow-wrap: break-word; }
  .strich { width: 26mm; height: 0; border-top: 1.5pt solid ${GOLD}; margin: 7mm 0 6mm; }
  .titel p { margin: 0; font-size: 15pt; color: #000; }
  .titel .unten, .rueck .unten { margin-top: auto; padding-top: 4mm; border-top: 0.25pt solid ${LINIE}; font-size: 8pt; color: ${GRAU}; }

  .prospekt-titel { padding: 0; }
  .prospekt-titel .oben { padding: 20mm 24mm 14mm; }
  .prospekt-titel .band { background: ${NAVY}; color: #fff; padding: 16mm 24mm 15mm; border-bottom: 2.5pt solid ${GOLD}; }
  .prospekt-titel h1 { color: #fff; font-size: 42pt; font-weight: 700; }
  .prospekt-titel p { margin-top: 5mm; font-size: 16pt; font-weight: 600; color: #e2a13f; }
  .prospekt-titel .auslage { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; padding: 14mm 24mm 0; }
  .prospekt-titel .auslage div { aspect-ratio: 1; border: 0.25pt solid ${LINIE}; padding: 2mm; display: flex; }
  .prospekt-titel .auslage img { width: 100%; height: 100%; object-fit: contain; }
  .prospekt-titel .unten { margin: auto 24mm 16mm; }

  .rueck .block { margin-top: 40mm; }
  .rueck h2 { margin: 0; font-size: 20pt; font-weight: 600; color: ${BLAU}; }
  .rueck table { border-collapse: collapse; font-size: 11pt; }
  .rueck th, .rueck td { padding: 2.2mm 0; text-align: left; vertical-align: top; border-bottom: 0.25pt solid ${LINIE}; }
  .rueck th { width: 38mm; font-weight: 600; color: ${GRAU}; }
  .rueck .frei { margin: 10mm 0 0; max-width: 130mm; font-size: 10.5pt; line-height: 1.5; white-space: pre-line; }
  .rueck .unten p { margin: 0 0 1.5mm; }

  /* --- Prospekt: nur Farbe und Gewicht, keine anderen Maße ------------ */
  .s-prospekt .artikel .kopf { border-bottom: 0; padding: 0 4mm; }
  .s-prospekt .artikel .kopf .gruppe { color: #fff; font-size: 12pt; font-weight: 700; }
  .s-prospekt .artikel .kopf .marke { color: #fff; }
  .s-prospekt .artikel .kopf .marke i { color: #fff; opacity: 0.85; }
  .s-prospekt .kz { border-color: ${NAVY}; background: ${NAVY}; color: #fff; }
  .s-prospekt .kz.top { border-color: ${GOLD}; background: ${GOLD}; }
  .s-prospekt .kachel .preis .pb { display: inline-flex; align-items: flex-start; font-size: 19pt; line-height: 1; }
  .s-prospekt .l-gross .kachel .preis .pb { font-size: 24pt; }
  .s-prospekt .kachel .cent { font-size: 0.52em; margin-left: 0.06em; }
  .s-prospekt .kachel .waehrung { font-size: 0.52em; margin-left: 0.12em; }
  .s-prospekt .zwischen { border-bottom: 0; padding: 0; align-items: stretch; }
  .s-prospekt .zwischen span { flex: 1; display: flex; align-items: center; padding: 0 4mm; margin: 1.2mm 0; color: #fff; font-weight: 700; }

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

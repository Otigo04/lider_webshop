import "server-only";
import { barcode as strichcode, type Barcode } from "@/lib/barcode";
import { formatPrice } from "@/lib/format";
import {
  AKTIONSROT,
  CENT_ANTEIL,
  CODEROT,
  LABEL_LUFT,
  NAME_GEWICHT,
  NAME_ZEILE,
  RAND,
  SCHRIFT,
  SEITE,
  barcodeMasse,
  fussHoehe,
  istReduziert,
  kennungSchriftgroesse,
  kopfHoehe,
  labelBreite,
  labelSchrift,
  nameBreite,
  nameSatz,
  nebenblockBreite,
  preisSchriftgroesse,
  preisTeile,
  raster,
  schildKennung,
  schildMasse,
  strichcodeTaugt,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";

/**
 * Druckbogen für Regal-Preisschilder.
 *
 * HTML plus `window.print()` wie beim Kassenbon (lib/pos-receipt.ts) und aus
 * demselben Grund: damit druckt jeder Drucker, für den ein Treiber da ist.
 * Ein PDF über pdf-lib wäre hier sogar der Umweg – die Schilder sind reines
 * Rechteck-Layout, das CSS-Grid ohne eine Zeile Koordinatenrechnerei setzt.
 *
 * Ausgegeben wird ein fertiger A4-Bogen: Raster, Schnittlinien, Folgeseiten.
 * Am Ende liegt ein Blatt im Drucker, das nur noch zerschnitten werden muss.
 */

/** Kein Text aus der Datenbank darf als Markup im Bogen landen. */
function esc(wert: unknown): string {
  return String(wert ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Millimeterwert fürs Stylesheet – drei Nachkommastellen reichen dem Drucker. */
function mm(wert: number): string {
  return `${wert.toFixed(3)}mm`;
}

/**
 * Schnittlinien als eigene Ebene über dem Raster.
 *
 * Nicht als Zellrahmen: die roten Schilder sollen randlos ausgeschnitten
 * werden, also füllt die Farbfläche die Zelle bis zur Kante. Eine Linie
 * *innerhalb* der Zelle läge dann unter der Farbe und wäre auf einem roten
 * Schild unsichtbar – ausgerechnet dort, wo man sie zum Schneiden braucht.
 *
 * Einzelne Linien statt eines sich wiederholenden Verlaufs, damit sie an
 * derselben Stelle sitzen wie die Zellgrenzen: ein `repeating-linear-gradient`
 * rundet über zwanzig Wiederholungen sichtbar weg.
 */
function schnittlinien(format: SchildFormat): string {
  const { spalten, zeilen } = raster(format);
  const linien: string[] = [];

  for (let i = 0; i <= spalten; i++) {
    linien.push(`<div class="schnitt v" style="left:${mm(i * format.breite)}"></div>`);
  }
  for (let i = 0; i <= zeilen; i++) {
    linien.push(`<div class="schnitt h" style="top:${mm(i * format.hoehe)}"></div>`);
  }
  return linien.join("");
}

/**
 * Ein Schild.
 *
 * Reduziert = rote Fläche mit schwarzer Schrift, sonst weiße Fläche mit
 * schwarzer Schrift. Der Großhandelscode ist die einzige Ausnahme: auf Weiß
 * steht er rot, auf Rot schwarz – er soll sich von der Artikelnummer absetzen,
 * ohne wie eine zweite Preisangabe auszusehen.
 *
 * Preis- und Fußzeilengröße stehen inline und nicht im Stylesheet: beide
 * hängen von der Länge ihres Textes ab, damit ein vierstelliger Preis oder
 * eine lange Artikelnummer nicht über den Rand läuft.
 */
function schild(s: Preisschild, format: SchildFormat, mitCode: boolean): string {
  const masse = schildMasse(format, { barcode: mitCode });
  const rot = istReduziert(s);
  const { euro, cent } = preisTeile(s.preis);
  // Striche nur, wenn der Wert ein EAN ist und das Format Platz dafür hat –
  // sonst wandert die Nummer als Text in die Fußzeile.
  const belegt = nebenblockBreite(s.vorher, s.prozent, masse);

  /*
   * Fußzeile von rechts nach links aufgeteilt: das Label behält sein Maß,
   * der Strichcode nimmt sich davon, was bis zur Reserve der Artikelnummer
   * übrig ist, und die Nummer bekommt den Rest. Bleibt für den Code zu wenig,
   * gibt es keinen – die Nummer steht dann im Klartext da.
   */
  const labelB = labelBreite(s.label, masse);
  const roh = masse.barcode > 0 ? strichcode(s.barcode) : null;
  const balken = roh ? barcodeMasse(roh.breite, masse, labelB) : null;
  const code = balken && strichcodeTaugt(balken.modul) ? roh : null;
  /*
   * Klartext nur, wenn die Nummer **kein** EAN ist. Wurde der Code bloß aus
   * Platzmangel weggelassen, hülfe die Ziffernfolge niemandem: sie ist
   * dreizehnstellig, und in der Breite, die übrig war, stünde sie in
   * Ameisengröße da und nähme der Artikelnummer auch noch den Rest.
   */
  const kennung = schildKennung(s.sku, s.code, roh ? null : s.barcode);
  const belegtRechts =
    labelB + (code && balken ? balken.breite + masse.luft * 0.7 : 0);

  const neben =
    s.vorher !== null || s.prozent !== null
      ? `<div class="neben">
          ${s.vorher !== null ? `<span class="vorher">${esc(formatPrice(s.vorher))}</span>` : ""}
          ${s.prozent !== null ? `<span class="prozent">−${s.prozent}&nbsp;%</span>` : ""}
        </div>`
      : "";

  const label = s.label
    ? `<span class="label" style="background:${esc(s.label.farbe)};color:${labelSchrift(s.label.farbe)}">${esc(s.label.name)}</span>`
    : "";

  // Die Bezeichnung setzt das Skript am Ende des Bogens in zwei Zeilen
  // (nameSatz()): messen kann erst der Browser, der die Schrift hat. Bis
  // dahin – und ohne Skript – steht sie als Fließtext da.
  return `<div class="zelle${rot ? " rot" : ""}">
    <div class="kopf">
      ${s.icon ? `<img class="icon" src="${s.icon}" alt="">` : ""}
      <span class="name" data-breite="${nameBreite(masse, !!s.icon).toFixed(3)}">${esc(s.name)}</span>
    </div>
    <div class="trenner"></div>
    <div class="preisblock">
      <div class="preiszeile">
        <div class="preis" style="font-size:${mm(preisSchriftgroesse(s.preis, masse, belegt))}">
          <span class="euro">${esc(euro)}</span><span class="cent">${esc(cent)}</span><span class="waehrung">€</span>
        </div>
        ${neben}
      </div>
    </div>
    <div class="trenner"></div>
    <div class="fuss">
      <span class="kennung" style="font-size:${mm(kennungSchriftgroesse(kennung, masse, belegtRechts))}">${
        esc(s.sku)
      }${s.code ? `<span class="code">#${esc(s.code)}</span>` : ""}${
        !roh && s.barcode ? `<span class="barcode">${esc(s.barcode)}</span>` : ""
      }</span>
      ${strichbild(code, balken, masse)}
      ${label}
    </div>
  </div>`;
}

/**
 * Strichcode in der Fußzeile, rechts neben der Artikelnummer.
 *
 * **Ohne weiße Fläche.** Die Striche stehen direkt auf dem Schild, auch auf
 * dem roten: ein weißer Kasten mitten auf einem Aktionsschild ist ein Fleck,
 * und das Schild soll ruhig aussehen. Für einen Laserscanner ändert das
 * nichts – rotes Licht sieht Rot wie Weiß; ein Kamerascanner hat auf Rot
 * immer noch rund 4:1 Kontrast zu Schwarz.
 *
 * Die Ruhezonen links und rechts stecken als helle Module in der Breite und
 * sind hier eben rot statt weiß. Der Abstand zur Artikelnummer kommt aus der
 * Fußzeile selbst dazu.
 */
function strichbild(
  code: Barcode | null,
  balken: { breite: number; modul: number } | null,
  masse: ReturnType<typeof schildMasse>,
): string {
  if (masse.barcode <= 0 || !code || !balken) return "";

  const { breite, modul } = balken;
  const striche = code.abschnitte
    .map(
      (a) =>
        `<i class="${a.strich ? "b" : "l"}" style="width:${mm(a.module * modul)}"></i>`,
    )
    .join("");

  return `<div class="bc" style="width:${mm(breite)};height:${mm(masse.barcode)}">${striche}</div>`;
}

export interface BogenOptions {
  format: SchildFormat;
  /** Druckdialog beim Öffnen selbst auslösen */
  autoPrint?: boolean;
}

/**
 * Vollständiges HTML-Dokument mit allen Bögen.
 *
 * Die Schilder werden hier nicht vervielfältigt – die Liste kommt bereits
 * Stück für Stück herein. Wie viele Bögen daraus werden, ergibt sich aus der
 * Länge: die letzte Seite bleibt angebrochen, statt mit Platzhaltern
 * aufgefüllt zu werden. Leere Zellen sind weißes Papier, kein Fehler.
 */
export function buildLabelSheetHtml(
  schilder: Preisschild[],
  { format, autoPrint = true }: BogenOptions,
): string {
  /*
   * Ein Bogen entscheidet einmal, ob er Strichcodes trägt – nicht jedes
   * Schild für sich. Sonst stünde der Preis auf den Schildern mit Code kleiner
   * als auf denen ohne, und nebeneinander auf einem Blatt sähe das aus wie ein
   * Fehler.
   */
  const mitCode = schilder.some((s) => strichcode(s.barcode) !== null);
  const m = schildMasse(format, { barcode: mitCode });
  const r = raster(format);

  const seiten: string[] = [];
  for (let start = 0; start < schilder.length; start += r.proBogen) {
    const teil = schilder.slice(start, start + r.proBogen);
    seiten.push(`<section class="bogen">
      <div class="raster">${teil.map((s) => schild(s, format, mitCode)).join("")}</div>
      <div class="linien" aria-hidden="true">${schnittlinien(format)}</div>
    </section>`);
  }

  if (seiten.length === 0) {
    seiten.push(
      `<section class="bogen"><p class="leer">Keine Schilder ausgewählt.</p></section>`,
    );
  }

  const titel = `Preisschilder ${format.name} – ${schilder.length} Stück auf ${seiten.length} Bogen`;

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
    /* Systemschrift, keine Webfont-Nachladung: fehlte sie beim Öffnen des
       Druckdialogs, stünden die Preise in einer Ersatzschrift auf dem Papier. */
    font-family: ${SCHRIFT};
    color: #000;
    /* Ohne das druckt Chrome die roten Flächen weiß – dann sähe ein
       Aktionsschild aus wie jedes andere. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .bogen {
    position: relative;
    width: ${mm(SEITE.breite)};
    height: ${mm(SEITE.hoehe)};
    padding: ${mm(RAND)};
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

  /* Ebene der Schnittlinien, deckungsgleich über dem belegten Raster. Sie ist
     so groß wie die Schilder zusammen, nicht wie die Nutzfläche: bei einem
     freien Maß bleibt rechts und unten ein Streifen Papier übrig, und dort
     hat keine Schnittlinie etwas zu suchen. */
  .linien {
    position: absolute;
    top: ${mm(RAND)};
    left: ${mm(RAND)};
    width: ${mm(r.rasterB)};
    height: ${mm(r.rasterH)};
    pointer-events: none;
  }
  .schnitt { position: absolute; background: #9a9a9a; }
  .schnitt.v { top: -2mm; height: calc(100% + 4mm); width: 0.2mm; }
  .schnitt.h { left: -2mm; width: calc(100% + 4mm); height: 0.2mm; }

  .zelle {
    display: flex;
    flex-direction: column;
    padding: ${mm(m.luft)};
    overflow: hidden;
    background: #fff;
  }
  .zelle.rot { background: ${AKTIONSROT}; }

  /* Feste Höhe: zwei Zeilen Bezeichnung, auch wenn nur eine gebraucht wird.
     Sonst rutschte der Preis mit der Länge des Namens auf und ab, und auf dem
     Bogen stünde ein Dutzend Preise auf verschiedenen Höhen. */
  .kopf {
    display: flex;
    align-items: center;
    gap: ${mm(m.luft * 0.7)};
    height: ${mm(kopfHoehe(m))};
    flex: none;
    overflow: hidden;
  }
  /* Die Bezeichnung nimmt, was übrig ist – das Symbol behält sein Maß, statt
     bei einem langen Namen zusammengedrückt zu werden. */
  .kopf .name { flex: 1; min-width: 0; }

  .icon {
    width: ${mm(m.icon)};
    height: ${mm(m.icon)};
    object-fit: contain;
    flex: none;
  }

  .name {
    font-size: ${mm(m.name)};
    font-weight: ${NAME_GEWICHT};
    line-height: ${NAME_ZEILE};
    /* Zwei Zeilen, dann Schluss: eine dritte Zeile drückte den Preis aus dem
       Schild, und der ist die Aussage. Greift nur, bis das Skript die Zeilen
       gesetzt hat. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .name.gesetzt { display: block; }
  .name .zeile { display: block; white-space: nowrap; }

  /* Haarlinien über und unter dem Preis. Sie tragen nichts vor, sie ordnen:
     drei Felder statt drei Zeilen, die im Weißraum schwimmen. */
  .trenner {
    height: ${mm(m.linie)};
    margin: ${mm(m.linienLuft)} 0;
    background: currentColor;
    opacity: 0.85;
    flex: none;
  }

  .preisblock {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 0;
  }

  /* Preis und Nebenblock nebeneinander: eine eigene Zeile für den alten Preis
     kostete Höhe, die auf einem kleinen Schild der neue besser braucht.
     Mittig und nicht an der Grundlinie ausgerichtet: der Nebenblock ist
     zweizeilig, und an der Grundlinie seiner ersten Zeile hängend ragte die
     zweite unter die Haarlinie. */
  .preiszeile {
    display: flex;
    align-items: center;
    gap: ${mm(m.luft * 0.7)};
    min-width: 0;
  }

  /* Euro groß, Cent und Währung hochgestellt: derselbe Betrag braucht so
     weniger Breite und kann größer gesetzt werden. */
  .preis {
    display: flex;
    align-items: flex-start;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.035em;
    white-space: nowrap;
  }
  .preis .euro { font-size: 1em; line-height: 1; }
  .preis .cent {
    font-size: ${CENT_ANTEIL}em;
    line-height: 1;
    margin-left: 0.04em;
    letter-spacing: -0.02em;
  }
  .preis .waehrung {
    font-size: ${CENT_ANTEIL}em;
    line-height: 1;
    margin-left: 0.14em;
    font-weight: 600;
  }

  /* Streichpreis und Prozentfeld untereinander rechts vom Preis: zusammen in
     einer Reihe wären sie breiter als der Preis selbst. */
  .neben {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: ${mm(m.luft * 0.3)};
    flex: none;
  }

  .vorher {
    font-size: ${mm(m.vorher)};
    font-weight: 600;
    text-decoration: line-through;
    /* Kein Grau: auf rotem Grund verschwände es. Die Durchstreichung sagt
       bereits, dass der Preis nicht mehr gilt. */
    text-decoration-thickness: 0.1em;
    white-space: nowrap;
  }

  /* Schwarzes Feld mit weißer Schrift – die einzige Auszeichnung, die auf
     weißem wie auf rotem Grund gleich stark steht. */
  .prozent {
    font-size: ${mm(m.prozent)};
    font-weight: 700;
    line-height: 1;
    padding: 0.22em 0.4em;
    background: #000;
    color: #fff;
    white-space: nowrap;
  }

  /* Fußzeile: Artikelnummer links, daneben der Strichcode, Label ganz rechts.
     Feste Höhe, damit ein Schild ohne Strichcode auf einem Bogen mit Codes
     genauso hoch bleibt – sonst stünden die Preise nebeneinander auf
     verschiedenen Höhen. */
  .fuss {
    display: flex;
    align-items: center;
    gap: ${mm(m.luft * 0.7)};
    height: ${mm(fussHoehe(m))};
    flex: none;
  }
  /* Die Nummer nimmt, was übrig ist; Strichcode und Label behalten ihr Maß. */
  .fuss .kennung { flex: 1; }

  .label {
    font-size: ${mm(m.label)};
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.15em ${LABEL_LUFT / 2}em;
    white-space: nowrap;
    flex: none;
  }

  .kennung {
    min-width: 0;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
    white-space: nowrap;
    overflow: hidden;
    flex: none;
  }
  .kennung .code { color: ${CODEROT}; }
  .zelle.rot .kennung .code { color: #000; }

  /* Rückfall für Nummern, aus denen kein EAN wird: als Ziffernfolge hinter
     einem Mittelpunkt, damit sie nicht wie eine Verlängerung der
     Artikelnummer gelesen wird. */
  .kennung .barcode { opacity: 0.7; font-weight: 500; }
  .kennung .barcode::before { content: " · "; opacity: 0.6; }

  /* --- Strichcode ---------------------------------------------------- */

  /* Kein Hintergrund: die Striche stehen direkt auf dem Schild, auf weißem
     wie auf rotem. Ein weißer Kasten mitten auf einem Aktionsschild wäre ein
     Fleck. Kein Innenabstand: die Ruhezonen stecken bereits als helle Module
     in der Breite (lib/barcode.ts), und ein Polster würde bei border-box vom
     Platz der Striche abgezogen – der Code käme gestaucht aus dem Drucker. */
  .bc {
    display: flex;
    align-items: stretch;
    flex: none;
  }
  /* flex:none, damit kein Strich weggerechnet wird: die Breiten stehen auf
     dem Zehntelmillimeter aus barcodeMasse(), und ein geschrumpfter Strich
     ist ein anderer Code. */
  .bc i { display: block; height: 100%; flex: none; }
  .bc i.b { background: #000; }

  .leer { padding: 20mm; font-size: 12pt; }

  .leiste {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px;
    background: #1f2937;
    color: #fff;
    font-size: 14px;
  }
  .leiste button {
    font: inherit;
    padding: 6px 14px;
    border: 0;
    border-radius: 4px;
    background: #fff;
    color: #111827;
    cursor: pointer;
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

  <script>
    // Bezeichnungen in zwei Zeilen setzen – dieselbe Funktion wie in der
    // Vorschau der Werkbank, per toString() hierher übernommen.
    (function () {
      var nameSatz = ${nameSatz.toString()};
      var ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = ${JSON.stringify(`${NAME_GEWICHT} 100px ${SCHRIFT}`)};
      var cache = {};
      function messen(t) {
        if (!(t in cache)) cache[t] = ctx.measureText(t).width / 100;
        return cache[t];
      }
      var basis = ${m.name};
      var satzCache = {};
      document.querySelectorAll(".name[data-breite]").forEach(function (el) {
        var text = el.textContent || "";
        var schluessel = el.getAttribute("data-breite") + "|" + text;
        var satz = satzCache[schluessel] ||
          (satzCache[schluessel] = nameSatz(text, parseFloat(el.getAttribute("data-breite")), basis, messen));
        el.textContent = "";
        satz.zeilen.forEach(function (zeile) {
          var span = document.createElement("span");
          span.className = "zeile";
          span.textContent = zeile;
          el.appendChild(span);
        });
        el.style.fontSize = satz.groesse.toFixed(3) + "mm";
        el.classList.add("gesetzt");
      });
    })();
  </script>

  ${
    autoPrint
      ? `<script>
    // Erst drucken, wenn Symbole und Schriften stehen – sonst geht ein halb
    // aufgebauter Bogen aufs Papier.
    window.addEventListener("load", function () {
      window.setTimeout(function () { window.print(); }, 200);
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

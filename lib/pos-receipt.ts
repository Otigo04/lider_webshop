import "server-only";
import { readFileSync } from "node:fs";
import { getLogoPrintFile } from "@/lib/logo";
import { toNumber } from "@/lib/format";
import type {
  CompanySettings,
  PosDayClosing,
  PosSale,
  PosSaleItem,
} from "@/lib/types";

/**
 * Kassenbon für den Bondrucker.
 *
 * Getrennt vom Rechnungs-PDF (lib/invoice.ts), weil es ein anderes Medium ist:
 * eine Endlosrolle von 58 oder 80 mm Breite, ein Thermodruckkopf ohne Graustufen
 * und ohne Rand. Ein A4-Layout darauf zu zwängen ergibt nur Ausschuss.
 *
 * Ausgegeben wird ein vollständiges HTML-Dokument, das der Browser druckt –
 * kein ESC/POS. Damit funktioniert jeder Bondrucker, für den ein Treiber
 * installiert ist, ohne Netzwerkkonfiguration, feste IP oder Kenntnis des
 * Herstellerdialekts. Der Bon ist reines Schwarzweiß: Thermopapier kennt
 * ohnehin nur bedruckt und unbedruckt.
 */

/** Übliche Rollenbreiten. Bedruckbar ist jeweils etwas weniger als die Rolle. */
const BREITEN = {
  80: { seite: 80, satz: 72 },
  58: { seite: 58, satz: 50 },
} as const;

export type Bonbreite = keyof typeof BREITEN;

export function istBonbreite(wert: unknown): wert is Bonbreite {
  return wert === 80 || wert === 58;
}

/** Kein Text aus der Datenbank darf als Markup im Bon landen. */
function esc(wert: unknown): string {
  return String(wert ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const euro = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function geld(wert: number | string | null | undefined): string {
  return euro.format(toNumber(wert));
}

function menge(wert: number | string): string {
  const zahl = toNumber(wert);
  return Number.isInteger(zahl) ? String(zahl) : euro.format(zahl);
}

/** Vierstelliges Jahr: ein Beleg wird jahrelang aufbewahrt. */
const zeitpunktFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Steuersatz ohne unnötige Nachkommastellen: „19 %", nicht „19,00 %". */
const prozentFormat = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 2,
});

/**
 * Logo als Data-URI. Der Druck läuft in einem eigenen Fenster; eine
 * nachgeladene Datei wäre ein zweiter Roundtrip, der den Druckdialog
 * womöglich vor dem Bild öffnet – dann fehlt das Logo auf dem Papier.
 */
function logoDataUri(): string | null {
  const datei = getLogoPrintFile();
  if (!datei) return null;
  try {
    const bytes = readFileSync(datei);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (fehler) {
    console.error("[bon] Logo laden:", fehler);
    return null;
  }
}

function zeileAdresse(company: CompanySettings): string[] {
  const zeilen: string[] = [];
  if (company.company_name) zeilen.push(company.company_name);
  if (company.owner_name) zeilen.push(`Inh. ${company.owner_name}`);
  if (company.address_street) zeilen.push(company.address_street);
  const ort = [company.address_zip, company.address_city].filter(Boolean).join(" ");
  if (ort) zeilen.push(ort);
  return zeilen;
}

function zeileKontakt(company: CompanySettings): string[] {
  const zeilen: string[] = [];
  if (company.phone) zeilen.push(`Tel. ${company.phone}`);
  if (company.email) zeilen.push(company.email);
  if (company.website) zeilen.push(company.website);
  return zeilen;
}

export interface BonOptions {
  breite?: Bonbreite;
  /** Druckdialog beim Öffnen selbst auslösen */
  autoPrint?: boolean;
}

/**
 * Gemeinsames Papier für Kassenbon und Z-Abschluss: dieselbe Rollenbreite,
 * dieselben Schriftgrößen, derselbe Firmenkopf. Getrennte Templates würden
 * über kurz oder lang auseinanderlaufen.
 */
function bonGeruest({
  titel,
  koerper,
  breite,
  autoPrint,
  knopfText,
}: {
  titel: string;
  koerper: string;
  breite: Bonbreite;
  autoPrint: boolean;
  knopfText: string;
}): string {
  const { seite, satz } = BREITEN[breite];

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titel)}</title>
<style>
  /* Endlospapier: feste Breite, offene Höhe, kein Seitenrand. */
  @page { size: ${seite}mm auto; margin: 0; }

  * { box-sizing: border-box; }

  body {
    margin: 0 auto;
    width: ${satz}mm;
    padding: 3mm 0 8mm;
    background: #fff;
    color: #000;
    /* Monospace, damit Betragsspalte und Trennlinien wirklich fluchten. */
    font-family: "Consolas", "DejaVu Sans Mono", "Courier New", monospace;
    font-size: 10.5px;
    line-height: 1.35;
    -webkit-font-smoothing: none;
  }

  /* Thermodruck kennt kein Grau: alles rein schwarz auf weiß. */
  img.logo {
    display: block;
    margin: 0 auto 2mm;
    width: 32mm;
    max-width: 70%;
    filter: grayscale(1) contrast(1.6);
  }

  .mitte { text-align: center; }
  .fett { font-weight: 700; }
  .klein { font-size: 9px; }
  .gross { font-size: 15px; font-weight: 700; }
  .abstand { margin-top: 2mm; }

  hr {
    border: 0;
    border-top: 1px dashed #000;
    margin: 2mm 0;
  }
  hr.voll { border-top: 1px solid #000; }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 3mm;
  }
  .row > span:last-child { white-space: nowrap; }

  /* Steuerblock als Raster: drei gleich breite Spalten fluchten über die
     Kopfzeile hinweg, was flexibles Verteilen nicht leistet. */
  .steuer {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }
  .steuer span:nth-child(2),
  .steuer span:nth-child(3) { text-align: right; }

  .pos { margin-bottom: 1.5mm; }
  .pos .bez { font-weight: 700; word-break: break-word; }
  .pos .sku { font-size: 8.5px; }

  .summe { font-size: 15px; font-weight: 700; }

  .drucken {
    margin: 4mm auto 0;
    display: block;
    padding: 2mm 4mm;
    font: inherit;
    cursor: pointer;
  }

  /* Auf Papier hat der Knopf nichts verloren. */
  @media print {
    .drucken { display: none; }
    body { width: auto; padding: 0 2mm 6mm; }
  }
</style>
</head>
<body>
${koerper}

  <button class="drucken" type="button" onclick="window.print()">${esc(knopfText)}</button>

  ${
    autoPrint
      ? `<script>
    // Erst drucken, wenn Logo und Schriften stehen – sonst druckt der Dialog
    // eine halb aufgebaute Seite.
    window.addEventListener("load", function () {
      window.setTimeout(function () { window.print(); }, 150);
    });
  </script>`
      : ""
  }
</body>
</html>`;
}

/** Logo, Anschrift, Kontakt und Steuernummern – Kopf beider Bonarten. */
function firmenkopf(company: CompanySettings): string {
  const logo = logoDataUri();

  return `  ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}

  <div class="mitte">
    ${zeileAdresse(company)
      .map((zeile, index) =>
        index === 0
          ? `<div class="fett">${esc(zeile)}</div>`
          : `<div>${esc(zeile)}</div>`,
      )
      .join("")}
    ${zeileKontakt(company)
      .map((zeile) => `<div class="klein">${esc(zeile)}</div>`)
      .join("")}
    ${
      company.tax_number
        ? `<div class="klein">St.-Nr. ${esc(company.tax_number)}</div>`
        : ""
    }
    ${
      company.vat_id
        ? `<div class="klein">USt-IdNr. ${esc(company.vat_id)}</div>`
        : ""
    }
  </div>`;
}

export function buildReceiptHtml(
  sale: PosSale,
  items: PosSaleItem[],
  company: CompanySettings,
  options: BonOptions = {},
): string {
  const brutto = toNumber(sale.total_amount);
  const netto = toNumber(sale.net_amount);
  const ust = toNumber(sale.vat_amount);
  const satzProzent = toNumber(sale.vat_rate);
  const stueck = items.reduce((summe, item) => summe + toNumber(item.quantity), 0);

  const kunde =
    sale.customer?.company_name ||
    sale.customer?.full_name ||
    sale.customer_label ||
    null;

  const positionen = items
    .map(
      (item) => `
      <div class="pos">
        <div class="bez">${esc(item.product_name)}</div>
        <div class="row">
          <span>${esc(menge(item.quantity))} × ${esc(geld(item.unit_price))}</span>
          <span class="betrag">${esc(geld(item.subtotal))}</span>
        </div>
        <div class="sku">${esc(item.product_sku)}</div>
      </div>`,
    )
    .join("");

  // Bei Nettopreisen ist die Zwischensumme eine eigene Information; bei
  // Bruttopreisen stünde dieselbe Zahl zweimal untereinander.
  const zwischensumme =
    company.pos_prices_gross === false
      ? `<div class="row"><span>Zwischensumme netto</span><span>${esc(geld(netto))}</span></div>`
      : "";

  const koerper = `${firmenkopf(company)}

  <hr class="voll">

  <div class="row"><span>Beleg</span><span class="fett">${esc(sale.receipt_number)}</span></div>
  <div class="row"><span>Datum</span><span>${esc(
    zeitpunktFormat.format(new Date(sale.created_at)),
  )}</span></div>
  ${kunde ? `<div class="row"><span>Kunde</span><span>${esc(kunde)}</span></div>` : ""}

  <hr>

  ${positionen}

  <hr>

  <div class="row klein"><span>Positionen</span><span>${esc(
    String(items.length),
  )} · ${esc(menge(stueck))} Stück</span></div>

  ${zwischensumme}

  <div class="row summe abstand"><span>SUMME</span><span>${esc(geld(brutto))} EUR</span></div>

  <hr>

  <div class="steuer klein"><span>Satz</span><span>Netto</span><span>USt.</span></div>
  <div class="steuer klein">
    <span>${esc(prozentFormat.format(satzProzent))} %</span>
    <span>${esc(geld(netto))}</span>
    <span>${esc(geld(ust))}</span>
  </div>

  <hr>

  <div class="row"><span>Zahlung ${
    sale.payment_method === "cash" ? "BAR" : "KARTE"
  }</span><span class="fett">${esc(geld(brutto))}</span></div>

  ${sale.note ? `<div class="klein abstand">${esc(sale.note)}</div>` : ""}

  <hr class="voll">

  <div class="mitte abstand fett">Vielen Dank für Ihren Einkauf!</div>
  ${
    company.pos_receipt_footer
      ? `<div class="mitte klein abstand">${esc(company.pos_receipt_footer).replace(
          /\n/g,
          "<br>",
        )}</div>`
      : ""
  }
  <div class="mitte klein abstand">Bitte bewahren Sie diesen Beleg auf.</div>`;

  return bonGeruest({
    titel: `Bon ${sale.receipt_number}`,
    koerper,
    breite: options.breite ?? 80,
    autoPrint: options.autoPrint !== false,
    knopfText: "Bon drucken",
  });
}

/**
 * Z-Abschluss auf Bonpapier.
 *
 * Dasselbe Papier wie der Kassenbon, andere Zahlen: keine Positionen, sondern
 * die Tagessumme, aufgeteilt nach Zahlart, mit Belegnummernbereich. Der
 * Bereich ist der Grund, warum der Z-Bon mehr ist als ein Ausdruck der
 * Bildschirmzeile: er belegt, welche Bons in diesen Abschluss geflossen sind.
 */
export function buildZBonHtml(
  abschluss: PosDayClosing,
  company: CompanySettings,
  options: BonOptions = {},
): string {
  const tagFormat = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  // business_date ist ein reines Datum; ohne timeZone "UTC" läse der
  // Formatierer es als UTC-Mitternacht und zeigte in Ortszeit den Vortag.
  const tag = tagFormat.format(new Date(`${abschluss.business_date}T00:00:00Z`));

  const bereich =
    abschluss.first_receipt && abschluss.last_receipt
      ? `${abschluss.first_receipt} – ${abschluss.last_receipt}`
      : "–";

  const koerper = `${firmenkopf(company)}

  <hr class="voll">

  <div class="mitte fett" style="font-size:13px">TAGESABSCHLUSS Z</div>
  <div class="mitte klein">${esc(tag)}</div>

  <hr>

  <div class="row"><span>Z-Nummer</span><span class="fett">${esc(abschluss.z_number)}</span></div>
  <div class="row"><span>Abgeschlossen</span><span>${esc(
    zeitpunktFormat.format(new Date(abschluss.closed_at)),
  )}</span></div>
  <div class="row"><span>Belege</span><span>${esc(
    String(abschluss.sales_count),
  )}</span></div>
  <div class="row klein"><span>Bereich</span><span>${esc(bereich)}</span></div>

  <hr>

  <div class="row"><span>Bar</span><span>${esc(geld(abschluss.cash_amount))}</span></div>
  <div class="row"><span>Karte</span><span>${esc(geld(abschluss.card_amount))}</span></div>

  <hr>

  <div class="row summe abstand"><span>UMSATZ</span><span>${esc(
    geld(abschluss.gross_amount),
  )} EUR</span></div>

  <hr>

  <div class="steuer klein"><span></span><span>Netto</span><span>USt.</span></div>
  <div class="steuer klein">
    <span>gesamt</span>
    <span>${esc(geld(abschluss.net_amount))}</span>
    <span>${esc(geld(abschluss.vat_amount))}</span>
  </div>

  ${
    abschluss.note
      ? `<hr><div class="klein">${esc(abschluss.note)}</div>`
      : ""
  }

  <hr class="voll">

  <div class="mitte klein abstand">
    ${
      abschluss.closed_by === null
        ? "Automatisch nachgeholt"
        : "Manuell abgeschlossen"
    }
  </div>
  <div class="mitte klein">Zum Kassenbuch nehmen.</div>`;

  return bonGeruest({
    titel: `Z-Abschluss ${abschluss.z_number}`,
    koerper,
    breite: options.breite ?? 80,
    autoPrint: options.autoPrint !== false,
    knopfText: "Z-Bon drucken",
  });
}

import "server-only";
import { readFile } from "node:fs/promises";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import type { AppUser, CompanySettings, Invoice, InvoiceItem, Order } from "@/lib/types";
import { formatDate, formatPrice, formatQuantity, toNumber } from "@/lib/format";
import { steuer } from "@/lib/vat";
import { getLogoPrintFile } from "@/lib/logo";

/**
 * Einfache PDF-Erzeugung mit pdf-lib statt @react-pdf/renderer oder
 * Puppeteer: keine Font-/Browser-Abhängigkeiten, läuft ohne Zusatzkonfiguration
 * in einer Vercel Function. Reicht für eine reine Positions-/Summentabelle.
 *
 * generateInvoicePdf() kennt weder Order noch die freie Rechnung direkt –
 * beide Rechnungsarten (aus dem Katalog bestellt, oder frei vom Admin
 * eingetragen) werden vorher über die build*PdfData()-Funktionen in dieselbe
 * InvoicePdfData-Form gebracht. So bleibt das Layout an einer Stelle.
 */

export interface InvoicePdfLineItem {
  description: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoicePdfVatBreakdown {
  rate: number;
  net: number;
  vat: number;
}

export interface InvoicePdfData {
  /** Überschrift des Belegs. Vorgabe "Rechnung", der Kassenbon heißt anders. */
  documentTitle?: string;
  invoiceNumber: string;
  issuedAt: string;
  /** z. B. "Bestellung LG-2026-00012" oder eine Notiz zur freien Rechnung */
  reference?: string;
  customerName: string;
  customerStreet?: string | null;
  customerZip?: string | null;
  customerCity?: string | null;
  /**
   * USt-IdNr. des Empfängers (Migration 028). Bei einer Lieferung an einen
   * Abnehmer im EU-Ausland muss sie auf der Rechnung stehen (§ 14a UStG);
   * fehlt sie, bleibt die Zeile einfach weg.
   */
  customerVatId?: string | null;
  items: InvoicePdfLineItem[];
  netTotal: number;
  /** 0 bei Katalog-Bestellungen – der Shop rechnet dort ausschließlich netto */
  vatTotal: number;
  grossTotal: number;
  /** Aufschlüsselung je MwSt.-Satz – Grundlage der Steuerzeilen im Summenblock */
  vatBreakdown?: InvoicePdfVatBreakdown[];
  /**
   * Abweichende Lieferanschrift, mehrzeilig. Steht unter dem Belegtitel, nicht
   * im Anschriftenfeld: dort gehört der Rechnungsempfänger hin, und der
   * bleibt derselbe, auch wenn die Ware woandershin geht.
   */
  deliveryAddress?: string | null;
  /**
   * Sind die Positionspreise Endpreise? Im Großhandel netto, an der Kasse in
   * der Regel brutto – die Spaltenüberschrift muss das sagen, sonst rechnet
   * jemand nach und kommt auf eine andere Summe.
   */
  itemPricesGross?: boolean;
  /**
   * Beleg ohne Preise – der Lieferschein.
   *
   * Ein Lieferschein trägt Positionen und Mengen, aber keine Beträge: er reist
   * mit der Ware und landet beim Auspacken oft in fremden Händen, und was die
   * Ware kostet, steht auf der Rechnung. Statt des Summenblocks stehen unten
   * Positionszahl, Gesamtmenge und zwei Linien zum Quittieren.
   */
  hidePrices?: boolean;
  /** Freie Schlusszeile, z. B. die Bon-Fußzeile aus den Einstellungen */
  footerNote?: string | null;
  /** Ersetzt das Zahlungsziel, wenn schon bezahlt wurde ("Bar bezahlt") */
  paymentNote?: string | null;
  company: CompanySettings;
}

/**
 * Kassenbeleg. Gleiches Layout wie die Rechnung – ein Beleg aus dem Laden ist
 * steuerlich dasselbe Dokument, nur mit anderer Überschrift und ohne
 * Zahlungsziel.
 */
export function buildPosReceiptPdfData(
  sale: {
    receipt_number: string;
    created_at: string;
    payment_method: "cash" | "card";
    vat_rate: number;
    net_amount: number;
    vat_amount: number;
    total_amount: number;
    note: string | null;
    customer_label: string | null;
  },
  items: {
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }[],
  customer: AppUser | null,
  company: CompanySettings,
  pricesGross: boolean,
): InvoicePdfData {
  const zahlart = sale.payment_method === "card" ? "Karte" : "bar";

  return {
    documentTitle: "Kassenbeleg",
    invoiceNumber: sale.receipt_number,
    issuedAt: sale.created_at,
    reference: sale.note ?? undefined,
    customerName:
      customer?.company_name ||
      customer?.full_name ||
      sale.customer_label ||
      "Barverkauf",
    customerStreet: customer?.billing_street ?? null,
    customerZip: customer?.billing_zip ?? null,
    customerCity: customer?.billing_city ?? null,
    items: items.map((item) => ({
      description: item.product_name,
      sku: item.product_sku,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      subtotal: toNumber(item.subtotal),
    })),
    netTotal: toNumber(sale.net_amount),
    vatTotal: toNumber(sale.vat_amount),
    grossTotal: toNumber(sale.total_amount),
    vatBreakdown: [
      {
        rate: toNumber(sale.vat_rate),
        net: toNumber(sale.net_amount),
        vat: toNumber(sale.vat_amount),
      },
    ],
    itemPricesGross: pricesGross,
    paymentNote: `Betrag ${zahlart} erhalten. Vielen Dank für Ihren Einkauf.`,
    footerNote: company.pos_receipt_footer,
    company,
  };
}

/**
 * Anschrift, an die die Ware geht – mehrzeilig, oder null, wenn sie sich mit
 * der Rechnungsanschrift deckt.
 *
 * Nur eine wirklich abweichende Anschrift ist eine Angabe wert: deckt sie sich
 * mit der Rechnungsanschrift, stünde sie zweimal auf dem Blatt. Der
 * Lieferschein braucht sie auch dann, wenn sie sich deckt – deshalb der
 * Schalter, statt zwei ähnliche Funktionen.
 */
function lieferanschriftZeilen(
  order: Order,
  options: { immer?: boolean } = {},
): string | null {
  const customer = order.customer;
  const abholung = order.delivery_method === "pickup";

  const abweichend =
    !abholung &&
    Boolean(order.delivery_street) &&
    (order.delivery_street !== customer?.billing_street ||
      order.delivery_zip !== customer?.billing_zip ||
      order.delivery_city !== customer?.billing_city);

  if (!abweichend && !options.immer) return null;

  const zeilen = abweichend
    ? [
        order.delivery_name,
        order.delivery_street,
        [order.delivery_zip, order.delivery_city].filter(Boolean).join(" "),
        order.delivery_country &&
        order.delivery_country.toLowerCase() !== "deutschland"
          ? order.delivery_country
          : null,
      ]
    : [
        customer?.company_name || customer?.full_name,
        customer?.billing_street,
        [customer?.billing_zip, customer?.billing_city].filter(Boolean).join(" "),
      ];

  const gesetzt = zeilen.filter(Boolean) as string[];
  return gesetzt.length > 0 ? gesetzt.join("\n") : null;
}

export function buildOrderInvoicePdfData(
  order: Order,
  invoiceNumber: string,
  company: CompanySettings,
  /**
   * Ausstellungsdatum. Vorgabe ist „jetzt" – beim Stellen der Rechnung ist das
   * richtig. Wird eine bereits gestellte Rechnung nachgedruckt, muss das
   * Datum von der Rechnungszeile kommen: ein zweiter Ausdruck mit heutigem
   * Datum wäre ein anderes Dokument unter derselben Nummer.
   */
  issuedAt?: string,
): InvoicePdfData {
  const customer = order.customer;
  const netto = toNumber(order.total_amount);
  const satz = toNumber(order.vat_rate);
  const betraege = steuer(netto, satz);

  /*
   * Bar und Karte werden bei der Abholung kassiert. Der Vermerk ersetzt das
   * Zahlungsziel – ein Fälligkeitsdatum auf einer Rechnung, die am Tresen
   * beglichen wird, läse sich wie eine offene Forderung.
   */
  const zahlvermerk =
    order.payment_method === "cash"
      ? "Zahlung bar bei Abholung."
      : order.payment_method === "card"
        ? "Zahlung per Karte bei Abholung."
        : null;

  const lieferanschrift = lieferanschriftZeilen(order);

  return {
    invoiceNumber,
    issuedAt: issuedAt ?? new Date().toISOString(),
    reference: `Bestellung ${order.order_number}`,
    customerName: customer?.company_name || customer?.full_name || "–",
    customerStreet: customer?.billing_street,
    customerZip: customer?.billing_zip,
    customerCity: customer?.billing_city,
    customerVatId: customer?.vat_id,
    deliveryAddress: lieferanschrift,
    items: (order.items ?? []).map((item) => ({
      description: item.product_name,
      sku: item.product_sku,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      subtotal: toNumber(item.subtotal),
    })),
    netTotal: betraege.netto,
    vatTotal: betraege.steuer,
    grossTotal: betraege.brutto,
    vatBreakdown:
      betraege.steuer > 0
        ? [{ rate: betraege.satz, net: betraege.netto, vat: betraege.steuer }]
        : undefined,
    paymentNote: zahlvermerk,
    company,
  };
}

/**
 * Lieferschein zu einer Bestellung.
 *
 * Dieselbe Vorlage wie die Rechnung, nur ohne Beträge (`hidePrices`). Ein
 * eigenes Layout hätte bedeutet, Briefkopf, Fußzeile mit den Pflichtangaben und
 * die Positionstabelle ein zweites Mal zu pflegen – und dann liefen sie
 * auseinander, sobald sich eine Anschrift ändert.
 *
 * Nummer ist die Bestellnummer, kein eigener Nummernkreis: ein Lieferschein
 * gehört zu genau einer Bestellung und wird nicht fortlaufend nummeriert
 * geführt. Ein dritter Zähler neben Rechnung und Kassenbeleg wäre eine Reihe,
 * die lückenlos bleiben müsste, ohne dass es dafür einen Grund gibt.
 *
 * Empfänger im Anschriftenfeld ist, wer die Ware bekommt – anders als auf der
 * Rechnung, wo der Zahlungspflichtige steht. Der Zettel liegt im Karton und
 * wird beim Auspacken gelesen, nicht in der Buchhaltung.
 */
export function buildDeliveryNotePdfData(
  order: Order,
  company: CompanySettings,
  /** Rechnungsnummer, falls schon gestellt – als Verweis in der Bezugszeile. */
  invoiceNumber?: string | null,
): InvoicePdfData {
  const customer = order.customer;
  const abholung = order.delivery_method === "pickup";
  const lieferanschrift = lieferanschriftZeilen(order, { immer: true });
  const empfaenger = (lieferanschrift ?? "").split("\n");

  const bezug = [
    `Bestellung ${order.order_number} vom ${formatDate(order.created_at)}`,
    invoiceNumber ? `Rechnung ${invoiceNumber}` : null,
    abholung ? "Selbstabholung" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    documentTitle: "Lieferschein",
    invoiceNumber: order.order_number,
    issuedAt: new Date().toISOString(),
    reference: bezug,
    customerName: empfaenger[0] || customer?.company_name || customer?.full_name || "–",
    customerStreet: empfaenger[1] ?? null,
    customerCity: empfaenger[2] ?? null,
    items: (order.items ?? []).map((item) => ({
      description: item.product_name,
      sku: item.product_sku,
      quantity: toNumber(item.quantity),
      // Preise stehen im Lieferschein nicht, die Felder bleiben aber Teil der
      // gemeinsamen Form – hidePrices entscheidet, ob sie gezeichnet werden.
      unitPrice: 0,
      subtotal: 0,
    })),
    netTotal: 0,
    vatTotal: 0,
    grossTotal: 0,
    hidePrices: true,
    // Der Lieferschein ist keine Zahlungsaufforderung: ohne diesen Vermerk
    // stünde im Eckdatenkasten ein Fälligkeitsdatum.
    paymentNote: invoiceNumber
      ? `Die Abrechnung erfolgt mit Rechnung ${invoiceNumber}. Dieser Lieferschein ist keine Rechnung.`
      : "Dieser Lieferschein ist keine Rechnung; die Abrechnung erfolgt gesondert.",
    company,
  };
}

export function buildManualInvoicePdfData(
  invoice: Invoice,
  items: InvoiceItem[],
  customer: AppUser,
  company: CompanySettings,
): InvoicePdfData {
  const breakdown = new Map<number, { net: number; vat: number }>();
  for (const item of items) {
    const rate = toNumber(item.vat_rate);
    const net = toNumber(item.subtotal);
    const vat = Math.round(((net * rate) / 100) * 100) / 100;
    const entry = breakdown.get(rate) ?? { net: 0, vat: 0 };
    entry.net += net;
    entry.vat += vat;
    breakdown.set(rate, entry);
  }

  return {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at,
    reference: invoice.notes ?? undefined,
    customerName: customer.company_name || customer.full_name || "–",
    customerStreet: customer.billing_street,
    customerZip: customer.billing_zip,
    customerCity: customer.billing_city,
    customerVatId: customer.vat_id,
    items: items.map((item) => ({
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      subtotal: toNumber(item.subtotal),
    })),
    netTotal: toNumber(invoice.net_amount),
    vatTotal: toNumber(invoice.vat_amount),
    grossTotal: toNumber(invoice.total_amount),
    vatBreakdown: [...breakdown.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([rate, sums]) => ({ rate, net: sums.net, vat: sums.vat })),
    company,
  };
}


// =============================================================================
// Layout
//
// Ein Blatt, drei feste Zonen: Briefkopf (Logo, Absender, Empfänger,
// Eckdaten), Positionstabelle mit Summenblock und eine breite Fußzeile mit
// allen Pflichtangaben. Die Fußzeile steht auf **jeder** Seite – bei einer
// zweiseitigen Rechnung darf das zweite Blatt nicht ohne Anschrift und
// Steuernummer dastehen.
//
// Farbe wird sparsam eingesetzt und stammt aus dem Logo (globals.css):
// Wappenblau trägt Kopfleiste, Tabellenkopf und Summe, Lorbeergold setzt die
// Trennlinien. Nichts davon ist Dekoration – die Farbe sagt jeweils, wo ein
// Abschnitt anfängt.
// =============================================================================

const PAGE_WIDTH = 595.28; // A4 in pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
/** Rechte Satzkante – alle rechtsbündigen Spalten enden hier oder davor. */
const CONTENT_R = PAGE_WIDTH - MARGIN;

/* Markenfarben, dieselben Werte wie im @theme-Block von app/globals.css. */
const BRAND = rgb(0.157, 0.251, 0.471); // #284078 Wappenblau
const GOLD = rgb(0.722, 0.447, 0.11); //   #b8721c Lorbeergold
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.85, 0.85, 0.87);
const WEISS = rgb(1, 1, 1);
/** Hinterlegung jeder zweiten Positionszeile. */
const ZEBRA = rgb(0.965, 0.972, 0.984);
/** Füllung des Eckdatenkastens und des Zahlungshinweises. */
const BRAND_SOFT = rgb(0.925, 0.941, 0.969);

/** Spaltenraster der Positionstabelle. `…R` sind rechte Kanten. */
const SPALTE = {
  pos: 58,
  name: 86,
  nameBreite: 218,
  mengeR: 350,
  preisR: 447,
  summeR: 537,
} as const;

/** Höhe des Fußzeilenbands: obere Goldlinie liegt hier über dem Seitenrand. */
const FUSS_OBEN = MARGIN + 70;
/** Tiefster Punkt, den der Fließtext erreichen darf. */
const INHALT_UNTEN = FUSS_OBEN + 24;

/** Maße des Logos im Briefkopf in pt. */
const LOGO_MAX_W = 120;
const LOGO_MAX_H = 75;

/**
 * Logodatei einmal pro Prozess lesen. `null` heißt „nicht vorhanden" und wird
 * gemerkt, damit nicht bei jeder Rechnung erneut auf die Platte gegriffen wird.
 */
let logoCache: Buffer | null | undefined;

async function ladeLogo(): Promise<Buffer | null> {
  if (logoCache !== undefined) return logoCache;

  const datei = getLogoPrintFile();
  if (!datei) {
    logoCache = null;
    return null;
  }

  try {
    logoCache = await readFile(datei);
  } catch (fehler) {
    console.error("[rechnung] Logo konnte nicht gelesen werden:", fehler);
    logoCache = null;
  }
  return logoCache;
}

/*
 * Die Standardschriften von pdf-lib sind WinAnsi-kodiert. Trifft drawText auf
 * ein Zeichen außerhalb dieser Kodierung, wirft es – und aus einer fehlenden
 * Rechnung wird ein 500er. Artikelnamen und Kundendaten kommen aber aus freier
 * Eingabe: türkische Namen (Yılmaz, Şahin) sind in einem Berliner Großhandel
 * der Normalfall. Deshalb wird jeder Text vor der Ausgabe entschärft statt auf
 * gutes Zutun zu hoffen.
 */

/** WinAnsi-Zeichen oberhalb von U+00FF (Euro, Anführungszeichen, Gedankenstrich). */
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Zeichen mit fester Entsprechung – Umschrift schlägt Fragezeichen. */
const ERSATZ: Record<string, string> = {
  ğ: "g",
  Ğ: "G",
  ş: "s",
  Ş: "S",
  ı: "i",
  İ: "I",
  ə: "e",
  ł: "l",
  Ł: "L",
  // Geschützte und schmale Leerzeichen: Intl setzt sie in Preise ("12,00 €").
  "\u00a0": " ",
  "\u202f": " ",
  "\u2009": " ",
};

function sicher(value: string): string {
  let out = "";
  for (const zeichen of (value ?? "").normalize("NFC")) {
    const ersatz = ERSATZ[zeichen];
    if (ersatz !== undefined) {
      out += ersatz;
      continue;
    }
    const code = zeichen.codePointAt(0) ?? 0;
    // Zeilenumbrüche kann eine einzelne drawText-Zeile nicht darstellen.
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += " ";
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    if (code <= 0xff || WINANSI_EXTRA.has(code)) {
      out += zeichen;
      continue;
    }
    // Letzter Versuch: Akzente abziehen (ő → o), sonst Fragezeichen.
    const zerlegt = zeichen
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    out += zerlegt && (zerlegt.codePointAt(0) ?? 0x100) <= 0xff ? zerlegt : "?";
  }
  return out;
}

/**
 * Zeilenumbruch nach Breite. Ein einzelnes Wort, das allein schon zu breit ist
 * (eine IBAN ohne Leerzeichen, eine lange Artikelnummer), wird hart getrennt –
 * sonst liefe es aus dem Satzspiegel heraus über den Nachbarn.
 */
function umbrechen(
  value: string,
  maxBreite: number,
  size: number,
  f: PDFFont,
): string[] {
  const passt = (v: string) => f.widthOfTextAtSize(v, size) <= maxBreite;
  const zeilen: string[] = [];
  let aktuell = "";

  const hartTeilen = (wort: string) => {
    let rest = wort;
    while (rest.length > 1 && !passt(rest)) {
      let laenge = rest.length - 1;
      while (laenge > 1 && !passt(rest.slice(0, laenge))) laenge--;
      zeilen.push(rest.slice(0, laenge));
      rest = rest.slice(laenge);
    }
    return rest;
  };

  for (const wort of sicher(value).split(/\s+/).filter(Boolean)) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort;
    if (passt(kandidat)) {
      aktuell = kandidat;
      continue;
    }
    if (aktuell) zeilen.push(aktuell);
    aktuell = hartTeilen(wort);
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen.length > 0 ? zeilen : [""];
}

/** Anschrift des Absenders in einer Zeile – für die Absenderzeile im Kopf. */
function absenderEinzeilig(company: CompanySettings): string {
  return [
    company.company_name,
    company.address_street,
    [company.address_zip, company.address_city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Mehrere PDFs zu einem zusammenfassen – Rechnung und Lieferschein in einer
 * Datei.
 *
 * Ein Dokument statt zwei, weil am Tresen der Druckdialog einmal aufgeht: zwei
 * Dateien hießen zweimal öffnen, zweimal drucken und zweimal die Frage, ob
 * beide Blätter im Fach liegen.
 */
export async function mergePdfs(teile: Buffer[]): Promise<Buffer> {
  const vorhanden = teile.filter((teil) => teil.length > 0);
  // Ein PDF ohne Seiten lässt sich speichern, aber von keinem Betrachter
  // öffnen – dann lieber ein Fehler, der im Log steht.
  if (vorhanden.length === 0) throw new Error("Keine PDF-Teile zum Zusammenfassen.");
  if (vorhanden.length === 1) return vorhanden[0];

  const ziel = await PDFDocument.create();
  for (const teil of vorhanden) {
    const quelle = await PDFDocument.load(teil);
    const seiten = await ziel.copyPages(quelle, quelle.getPageIndices());
    for (const seite of seiten) ziel.addPage(seite);
  }
  return Buffer.from(await ziel.save());
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = data.company;
  const titel = data.documentTitle ?? "Rechnung";
  /** Lieferschein: Positionen und Mengen, keine Beträge. */
  const ohnePreise = data.hidePrices === true;
  /** Breite der Bezeichnungsspalte – ohne Preisspalten bleibt viel mehr übrig. */
  const nameBreite = ohnePreise
    ? SPALTE.summeR - 60 - SPALTE.name
    : SPALTE.nameBreite;
  /** Rechte Kante der Mengenspalte. Ohne Preise steht sie am Satzrand. */
  const mengeR = ohnePreise ? SPALTE.summeR : SPALTE.mengeR;

  const logoBytes = await ladeLogo();
  let logo: PDFImage | null = null;
  if (logoBytes) {
    try {
      logo = await pdf.embedPng(logoBytes);
    } catch (fehler) {
      // Fehlt das Logo, sieht die Rechnung nüchterner aus – das ist kein Grund,
      // den Versand zu stoppen.
      console.error("[rechnung] Logo konnte nicht eingebettet werden:", fehler);
    }
  }

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let seite = 1;

  // ------------------------------------------------------------- Bausteine

  function text(
    value: string,
    x: number,
    opts: {
      size?: number;
      useFont?: PDFFont;
      color?: ReturnType<typeof rgb>;
      /** Abweichende Grundlinie – sonst gilt der laufende Satzspiegel `y`. */
      y?: number;
      /** `x` ist die rechte Kante statt der linken. */
      rechts?: boolean;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const f = opts.useFont ?? font;
    const s = sicher(value);
    page.drawText(s, {
      x: opts.rechts ? x - f.widthOfTextAtSize(s, size) : x,
      y: opts.y ?? y,
      size,
      font: f,
      color: opts.color ?? INK,
    });
  }

  function linie(ziel: PDFPage, hoehe: number, dicke = 0.5, farbe = LINE) {
    ziel.drawLine({
      start: { x: MARGIN, y: hoehe },
      end: { x: CONTENT_R, y: hoehe },
      thickness: dicke,
      color: farbe,
    });
  }

  /**
   * Fußzeile über die volle Blattbreite: Anschrift, Kontakt, Bank, Steuer.
   * Vier Spalten, weil alles darüber hinaus zu Kleinstschrift führt. Leere
   * Angaben fallen weg, statt eine Lücke zu hinterlassen.
   */
  function fusszeile(ziel: PDFPage) {
    const spalten: { titel: string; zeilen: string[] }[] = [
      {
        titel: "ANSCHRIFT",
        zeilen: [
          company.company_name,
          company.owner_name ? `Inh. ${company.owner_name}` : null,
          company.address_street,
          [company.address_zip, company.address_city].filter(Boolean).join(" "),
          company.address_country,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        titel: "KONTAKT",
        zeilen: [
          company.phone ? `Tel. ${company.phone}` : null,
          company.email,
          company.website,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        titel: "BANKVERBINDUNG",
        zeilen: [
          company.bank_name,
          company.iban ? `IBAN ${company.iban}` : null,
          company.bic ? `BIC ${company.bic}` : null,
        ].filter((v): v is string => Boolean(v)),
      },
      {
        titel: "STEUER",
        zeilen: [
          company.tax_number ? `Steuernummer ${company.tax_number}` : null,
          company.vat_id ? `USt-IdNr. ${company.vat_id}` : null,
        ].filter((v): v is string => Boolean(v)),
      },
    ];

    linie(ziel, FUSS_OBEN, 1.2, GOLD);

    const spaltenBreite = (CONTENT_R - MARGIN) / spalten.length;
    spalten.forEach((spalte, index) => {
      const x = MARGIN + index * spaltenBreite;
      let zy = FUSS_OBEN - 11;
      ziel.drawText(sicher(spalte.titel), {
        x,
        y: zy,
        size: 6.5,
        font: bold,
        color: BRAND,
      });
      zy -= 10;
      for (const zeile of spalte.zeilen) {
        for (const teil of umbrechen(zeile, spaltenBreite - 10, 7, font)) {
          ziel.drawText(sicher(teil), {
            x,
            y: zy,
            size: 7,
            font,
            color: MUTED,
          });
          zy -= 8.5;
        }
      }
    });
  }

  /** Farbstreifen an der Blattoberkante – Wappenblau mit goldenem Anlauf. */
  function kopfstreifen(ziel: PDFPage) {
    ziel.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 6,
      width: PAGE_WIDTH,
      height: 6,
      color: BRAND,
    });
    ziel.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 6,
      width: 150,
      height: 6,
      color: GOLD,
    });
  }

  /** Kopfleiste der Positionstabelle. Wiederholt sich auf jeder Folgeseite. */
  function tabellenkopf() {
    page.drawRectangle({
      x: MARGIN,
      y: y - 5,
      width: CONTENT_R - MARGIN,
      height: 18,
      color: BRAND,
    });
    const opt = { size: 8, useFont: bold, color: WEISS, y: y + 0.5 };
    text("POS.", SPALTE.pos, opt);
    text("BEZEICHNUNG", SPALTE.name, opt);
    text("MENGE", mengeR, { ...opt, rechts: true });
    if (!ohnePreise) {
      text(
        data.itemPricesGross ? "PREIS BRUTTO" : "PREIS NETTO",
        SPALTE.preisR,
        { ...opt, rechts: true },
      );
      text("GESAMT", SPALTE.summeR, { ...opt, rechts: true });
    }
    y -= 22;
  }

  function neueSeite() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    seite += 1;
    kopfstreifen(page);
    fusszeile(page);
    y = PAGE_HEIGHT - MARGIN - 10;
    text(`${titel} ${data.invoiceNumber} · Seite ${seite}`, MARGIN, {
      size: 8,
      color: MUTED,
    });
    y -= 24;
  }

  /** Reicht der Platz bis `benoetigt` nicht, wird umgebrochen. */
  function platzPruefen(benoetigt: number) {
    if (y - benoetigt >= INHALT_UNTEN) return false;
    neueSeite();
    return true;
  }

  // -------------------------------------------------------------- Briefkopf

  kopfstreifen(page);
  fusszeile(page);

  if (logo) {
    const skaliert = logo.scaleToFit(LOGO_MAX_W, LOGO_MAX_H);
    page.drawImage(logo, {
      x: CONTENT_R - skaliert.width,
      y: PAGE_HEIGHT - 26 - skaliert.height,
      width: skaliert.width,
      height: skaliert.height,
    });
  }

  // Absender links neben dem Logo.
  y = 770;
  text(company.company_name || "LIDER Groß- und Einzelhandel", MARGIN, {
    size: 14,
    useFont: bold,
    color: BRAND,
  });
  if (company.owner_name) {
    y -= 14;
    text(`Inh. ${company.owner_name}`, MARGIN, { size: 9, color: MUTED });
  }
  y -= 13;
  const absenderZeilen = [
    company.address_street,
    [company.address_zip, company.address_city].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];
  if (absenderZeilen.length === 0) {
    text("[Anschrift bitte unter /admin/settings ergänzen]", MARGIN, {
      size: 9,
      color: MUTED,
    });
  }
  for (const zeile of absenderZeilen) {
    text(zeile, MARGIN, { size: 9, color: MUTED });
    y -= 12;
  }

  // Eckdaten rechts: alles, wonach im Zweifel am Telefon gefragt wird.
  const eckdaten: [string, string][] = [
    [`${titel}-Nr.`, data.invoiceNumber],
    ["Datum", formatDate(data.issuedAt)],
  ];
  // Ein Zahlungsziel gibt es nur auf Rechnung. Ein bar bezahlter Kassenbeleg
  // trägt stattdessen den Zahlungsvermerk und darf kein Fälligkeitsdatum
  // zeigen – das läse sich wie eine offene Forderung.
  const aufRechnung = !data.paymentNote && !ohnePreise;
  const faelligAm = new Date(data.issuedAt);
  faelligAm.setDate(faelligAm.getDate() + (company.payment_terms_days ?? 14));
  if (aufRechnung) {
    eckdaten.push(["Fällig am", formatDate(faelligAm)]);
  }

  const kastenOben = 726;
  const kastenX = 340;
  const kastenHoehe = 18 + eckdaten.length * 15;
  page.drawRectangle({
    x: kastenX,
    y: kastenOben - kastenHoehe,
    width: CONTENT_R - kastenX,
    height: kastenHoehe,
    color: BRAND_SOFT,
  });
  page.drawRectangle({
    x: kastenX,
    y: kastenOben - kastenHoehe,
    width: 3,
    height: kastenHoehe,
    color: GOLD,
  });
  let kastenY = kastenOben - 20;
  for (const [beschriftung, wert] of eckdaten) {
    text(beschriftung, kastenX + 12, { size: 8.5, color: MUTED, y: kastenY });
    text(wert, CONTENT_R - 12, {
      size: 9.5,
      useFont: bold,
      color: INK,
      y: kastenY,
      rechts: true,
    });
    kastenY -= 15;
  }

  // Absenderzeile im Anschriftenfeld – die Zeile, die im Fensterumschlag über
  // der Kundenanschrift steht.
  y = 700;
  text(absenderEinzeilig(company), MARGIN, { size: 6.5, color: MUTED });
  y -= 3;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: 320, y },
    thickness: 0.4,
    color: LINE,
  });
  y -= 16;

  // Empfängeranschrift.
  const empfaenger = [
    data.customerName,
    data.customerStreet,
    [data.customerZip, data.customerCity].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];
  empfaenger.forEach((zeile, index) => {
    text(zeile, MARGIN, {
      size: 10.5,
      useFont: index === 0 ? bold : font,
    });
    y -= 14;
  });

  if (data.customerVatId) {
    y -= 2;
    text(`USt-IdNr.: ${data.customerVatId}`, MARGIN, { size: 9, color: MUTED });
    y -= 12;
  }

  // ------------------------------------------------------------ Belegtitel

  y = 606;
  text(titel.toUpperCase(), MARGIN, { size: 20, useFont: bold, color: BRAND });
  text(data.invoiceNumber, MARGIN + bold.widthOfTextAtSize(sicher(titel.toUpperCase()), 20) + 10, {
    size: 20,
    useFont: font,
    color: GOLD,
  });
  y -= 16;
  if (data.reference) {
    for (const zeile of umbrechen(data.reference, CONTENT_R - MARGIN, 9.5, font)) {
      text(zeile, MARGIN, { size: 9.5, color: MUTED });
      y -= 12;
    }
  }

  /*
   * Abweichende Lieferanschrift. Sie steht hier und nicht im Anschriftenfeld:
   * dort gehört der Rechnungsempfänger hin, und der bleibt derselbe, auch wenn
   * die Ware an eine Baustelle oder Filiale geht.
   *
   * Deutlich größer gesetzt als der übrige Kleintext, mit eigenem Kasten und
   * goldener Kante: die abweichende Anschrift ist die Angabe, nach der im
   * Versand gegriffen wird. In Fußnotengröße unter dem Belegtitel wurde sie
   * beim Packen überlesen, und dann ging die Ware an die Rechnungsadresse.
   */
  if (data.deliveryAddress) {
    const kastenB = 300;
    // Eine lange Firmenzeile („… GmbH – Filiale Nord, Halle 3") lief sonst
    // rechts aus dem Kasten heraus.
    const zeilen = data.deliveryAddress
      .split("\n")
      .filter(Boolean)
      .flatMap((zeile) => umbrechen(zeile, kastenB - 24, 11.5, bold));
    const kastenH = 16 + zeilen.length * 13 + 8;

    y -= 8;
    page.drawRectangle({
      x: MARGIN,
      y: y - kastenH + 12,
      width: kastenB,
      height: kastenH,
      color: BRAND_SOFT,
    });
    page.drawRectangle({
      x: MARGIN,
      y: y - kastenH + 12,
      width: 3,
      height: kastenH,
      color: GOLD,
    });

    text("LIEFERANSCHRIFT", MARGIN + 12, {
      size: 8,
      useFont: bold,
      color: BRAND,
    });
    y -= 14;
    for (const zeile of zeilen) {
      text(zeile, MARGIN + 12, { size: 11.5, useFont: bold, color: INK });
      y -= 13;
    }
    /*
     * Luft bis zur Positionstabelle. Der Kopfbalken der Tabelle beginnt bei
     * `y - 5` und ist 18 pt hoch, reicht also 13 pt über den Satzspiegel
     * hinaus. Die Unterkante des Kastens liegt kaum tiefer als die letzte
     * Zeile – ohne diesen Abstand stieße der Balken direkt an den Kasten, und
     * Lieferanschrift und Tabellenkopf klebten aneinander.
     */
    y -= 20;
  }

  // ------------------------------------------------------- Positionstabelle

  y = Math.min(y, 566);
  tabellenkopf();

  data.items.forEach((item, index) => {
    const zeilen = umbrechen(item.description, nameBreite, 9, font);
    const zusatz = item.sku ? `Art.-Nr. ${item.sku}` : null;
    const hoehe = zeilen.length * 11 + (zusatz ? 9 : 0) + 7;

    if (platzPruefen(hoehe + 30)) tabellenkopf();

    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - (hoehe - 11),
        width: CONTENT_R - MARGIN,
        height: hoehe,
        color: ZEBRA,
      });
    }

    // Zahlen stehen alle auf der ersten Zeile der Position, auch wenn die
    // Bezeichnung darunter weiterläuft – sonst rutschen Menge und Preis bei
    // langen Namen optisch zur nächsten Position.
    text(String(index + 1), SPALTE.pos, { size: 9, color: MUTED });
    text(formatQuantity(item.quantity), mengeR, {
      size: 9,
      // Auf dem Lieferschein ist die Menge die Aussage des Blattes – dort wird
      // abgezählt, ob die Kiste stimmt.
      useFont: ohnePreise ? bold : font,
      rechts: true,
    });
    if (!ohnePreise) {
      text(formatPrice(item.unitPrice), SPALTE.preisR, { size: 9, rechts: true });
      text(formatPrice(item.subtotal), SPALTE.summeR, {
        size: 9,
        useFont: bold,
        rechts: true,
      });
    }

    for (const zeile of zeilen) {
      text(zeile, SPALTE.name, { size: 9 });
      y -= 11;
    }
    if (zusatz) {
      text(zusatz, SPALTE.name, { size: 7.5, color: MUTED });
      y -= 9;
    }
    y -= 7;
  });

  // ------------------------------------------- Summenblock bzw. Mengenbilanz

  // Der Block bleibt zusammen: Netto, Steuer und Endbetrag auf zwei Seiten zu
  // verteilen macht die Rechnung unlesbar.
  platzPruefen(120);
  y -= 2;
  linie(page, y, 0.8, BRAND);
  y -= 18;

  const beschriftungR = SPALTE.preisR;
  const wertR = SPALTE.summeR;

  if (ohnePreise) {
    /*
     * Lieferschein: statt Beträgen die Zahlen, mit denen die Sendung geprüft
     * wird – wie viele Positionen, wie viele Stück insgesamt. Wer auspackt,
     * zählt gegen diese beiden Zahlen, und ohne sie müsste er die Zeilen
     * selbst addieren.
     */
    const stueck = data.items.reduce((summe, item) => summe + item.quantity, 0);
    text("Positionen", beschriftungR, { size: 9.5, color: MUTED, rechts: true });
    text(String(data.items.length), wertR, { size: 9.5, rechts: true });
    y -= 15;
    text("Gesamtmenge", beschriftungR, { size: 10, useFont: bold, rechts: true });
    text(formatQuantity(stueck), wertR, { size: 11, useFont: bold, rechts: true });
    y -= 26;

    /*
     * Zwei Linien zum Quittieren. Ein Lieferschein wird bei der Übergabe
     * unterschrieben; ohne vorgezeichnete Linien schreibt jeder woanders hin,
     * und auf dem zurückkommenden Blatt fehlt dann das Datum.
     */
    platzPruefen(56);
    const spaltenBreite = (CONTENT_R - MARGIN) / 2;
    const unterschriften = [
      "Datum, Unterschrift Lager",
      "Datum, Unterschrift Empfänger",
    ];
    y -= 22;
    unterschriften.forEach((beschriftung, index) => {
      const x = MARGIN + index * spaltenBreite;
      page.drawLine({
        start: { x, y: y + 12 },
        end: { x: x + spaltenBreite - 30, y: y + 12 },
        thickness: 0.6,
        color: LINE,
      });
      text(beschriftung, x, { size: 8, color: MUTED });
    });
    y -= 26;
  } else if (data.vatTotal > 0) {
    text("Zwischensumme netto", beschriftungR, {
      size: 9.5,
      color: MUTED,
      rechts: true,
    });
    text(formatPrice(data.netTotal), wertR, { size: 9.5, rechts: true });
    y -= 15;

    for (const row of data.vatBreakdown ?? []) {
      text(`zzgl. USt. ${row.rate.toFixed(0)} %`, beschriftungR, {
        size: 9.5,
        color: MUTED,
        rechts: true,
      });
      text(formatPrice(row.vat), wertR, { size: 9.5, rechts: true });
      y -= 15;
    }
  } else {
    // Der Katalog rechnet durchweg netto – dann gibt es keine Steuerzeile,
    // die etwas hinzufügt, und "Zwischensumme" wäre irreführend.
    text("Summe netto", beschriftungR, { size: 9.5, color: MUTED, rechts: true });
    text(formatPrice(data.netTotal), wertR, { size: 9.5, rechts: true });
    y -= 15;
  }

  // Endbetrag in einem blauen Balken: die eine Zahl, die jeder sucht. Der
  // Balken ragt über seine Grundlinie hinaus – der Abstand nach oben muss
  // deshalb größer sein als ein Zeilenabstand, sonst deckt er die Steuerzeile
  // zur Hälfte zu. Auf dem Lieferschein gibt es keinen Betrag, also auch
  // keinen Balken.
  if (!ohnePreise) {
    y -= 16;
    const balkenX = 320;
    page.drawRectangle({
      x: balkenX,
      y: y - 7,
      width: CONTENT_R - balkenX,
      height: 26,
      color: BRAND,
    });
    text(data.vatTotal > 0 ? "Gesamtbetrag brutto" : "Gesamtbetrag", balkenX + 14, {
      size: 10,
      useFont: bold,
      color: WEISS,
      y: y + 2,
    });
    text(formatPrice(data.grossTotal), wertR, {
      size: 12,
      useFont: bold,
      color: WEISS,
      y: y + 1,
      rechts: true,
    });
    y -= 34;
  }

  // ------------------------------------------------- Zahlungshinweis, Notiz

  const zahlungstext = data.paymentNote
    ? data.paymentNote
    : `Zahlbar ohne Abzug innerhalb von ${company.payment_terms_days} Tagen, bis zum ${formatDate(faelligAm)}.`;
  const zahlungszeilen = umbrechen(
    zahlungstext,
    CONTENT_R - MARGIN - 28,
    9,
    font,
  );
  const hinweisHoehe = zahlungszeilen.length * 12 + 12;
  platzPruefen(hinweisHoehe + 20);

  page.drawRectangle({
    x: MARGIN,
    y: y - hinweisHoehe + 12,
    width: CONTENT_R - MARGIN,
    height: hinweisHoehe,
    color: BRAND_SOFT,
  });
  page.drawRectangle({
    x: MARGIN,
    y: y - hinweisHoehe + 12,
    width: 3,
    height: hinweisHoehe,
    color: GOLD,
  });
  y -= 2;
  for (const zeile of zahlungszeilen) {
    text(zeile, MARGIN + 14, { size: 9, color: INK });
    y -= 12;
  }
  y -= 14;

  if (aufRechnung && company.iban) {
    text(
      `Bitte bei der Überweisung die ${titel}snummer ${data.invoiceNumber} angeben.`,
      MARGIN,
      { size: 8.5, color: MUTED },
    );
    y -= 14;
  }

  if (data.footerNote) {
    platzPruefen(30);
    for (const zeile of umbrechen(data.footerNote, CONTENT_R - MARGIN, 8.5, font)) {
      text(zeile, MARGIN, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

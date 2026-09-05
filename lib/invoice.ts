import "server-only";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { AppUser, CompanySettings, Invoice, InvoiceItem, Order } from "@/lib/types";
import { formatDate, formatPrice, formatQuantity, toNumber } from "@/lib/format";
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
  items: InvoicePdfLineItem[];
  netTotal: number;
  /** 0 bei Katalog-Bestellungen – der Shop rechnet dort ausschließlich netto */
  vatTotal: number;
  grossTotal: number;
  /** Nur bei freien Rechnungen: Aufschlüsselung je MwSt.-Satz */
  vatBreakdown?: InvoicePdfVatBreakdown[];
  /**
   * Sind die Positionspreise Endpreise? Im Großhandel netto, an der Kasse in
   * der Regel brutto – die Spaltenüberschrift muss das sagen, sonst rechnet
   * jemand nach und kommt auf eine andere Summe.
   */
  itemPricesGross?: boolean;
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

export function buildOrderInvoicePdfData(
  order: Order,
  invoiceNumber: string,
  company: CompanySettings,
): InvoicePdfData {
  const customer = order.customer;
  const total = toNumber(order.total_amount);

  return {
    invoiceNumber,
    issuedAt: new Date().toISOString(),
    reference: `Bestellung ${order.order_number}`,
    customerName: customer?.company_name || customer?.full_name || "–",
    customerStreet: customer?.billing_street,
    customerZip: customer?.billing_zip,
    customerCity: customer?.billing_city,
    items: (order.items ?? []).map((item) => ({
      description: item.product_name,
      sku: item.product_sku,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      subtotal: toNumber(item.subtotal),
    })),
    netTotal: total,
    vatTotal: 0,
    grossTotal: total,
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

const PAGE_WIDTH = 595.28; // A4 in pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.85, 0.85, 0.87);

/** Breite des Logos im Briefkopf in pt. */
const LOGO_WIDTH = 110;

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

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Briefkopf: Logo oben rechts, der Absender links daneben. Fehlt die Datei,
  // sieht die Rechnung aus wie bisher – kein Grund, den Versand zu stoppen.
  const logoBytes = await ladeLogo();
  if (logoBytes) {
    try {
      const bild = await pdf.embedPng(logoBytes);
      const skaliert = bild.scaleToFit(LOGO_WIDTH, LOGO_WIDTH);
      page.drawImage(bild, {
        x: PAGE_WIDTH - MARGIN - skaliert.width,
        y: PAGE_HEIGHT - MARGIN - skaliert.height + 12,
        width: skaliert.width,
        height: skaliert.height,
      });
    } catch (fehler) {
      console.error("[rechnung] Logo konnte nicht eingebettet werden:", fehler);
    }
  }

  function text(
    value: string,
    x: number,
    opts: { size?: number; useFont?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) {
    page.drawText(value, {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.useFont ?? font,
      color: opts.color ?? INK,
    });
  }

  function newPageIfNeeded(minY: number) {
    if (y > minY) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  // Absender
  const company = data.company;
  text(company.company_name || "LIDER Berlin Groß- und Einzelhandel", MARGIN, {
    size: 13,
    useFont: bold,
  });
  y -= 16;
  const senderAddressLine = [company.address_street, [company.address_zip, company.address_city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  text(
    senderAddressLine || "[Anschrift bitte unter /admin/settings ergänzen]",
    MARGIN,
    { size: 9, color: MUTED },
  );
  y -= 34;

  // Rechnungskopf
  text(`${data.documentTitle ?? "Rechnung"} ${data.invoiceNumber}`, MARGIN, {
    size: 16,
    useFont: bold,
  });
  y -= 20;
  if (data.reference) {
    text(data.reference, MARGIN, { size: 10, color: MUTED });
    y -= 14;
  }
  text(`Rechnungsdatum: ${formatDate(data.issuedAt)}`, MARGIN, {
    size: 10,
    color: MUTED,
  });
  y -= 34;

  // Rechnungsadresse
  text("Rechnungsadresse", MARGIN, { size: 10, useFont: bold });
  y -= 14;
  text(data.customerName, MARGIN, { size: 10 });
  y -= 13;
  if (data.customerStreet) {
    text(data.customerStreet, MARGIN, { size: 10 });
    y -= 13;
  }
  const cityLine = [data.customerZip, data.customerCity].filter(Boolean).join(" ");
  if (cityLine) {
    text(cityLine, MARGIN, { size: 10 });
    y -= 13;
  }
  y -= 20;

  // Positionstabelle
  const col = { name: MARGIN, qty: 330, price: 400, sum: 475 };
  text("Artikel", col.name, { size: 9, useFont: bold, color: MUTED });
  text("Menge", col.qty, { size: 9, useFont: bold, color: MUTED });
  text(
    data.itemPricesGross ? "Preis/Stk. brutto" : "Preis/Stk.",
    col.price,
    { size: 9, useFont: bold, color: MUTED },
  );
  text("Summe", col.sum, { size: 9, useFont: bold, color: MUTED });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 16;

  for (const item of data.items) {
    newPageIfNeeded(MARGIN + 140);
    const label = item.sku ? `${item.description} (${item.sku})` : item.description;
    text(label, col.name, { size: 9 });
    text(formatQuantity(item.quantity), col.qty, { size: 9 });
    text(formatPrice(item.unitPrice), col.price, { size: 9 });
    text(formatPrice(item.subtotal), col.sum, { size: 9 });
    y -= 16;
  }

  newPageIfNeeded(MARGIN + 120);
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 22;

  if (data.vatTotal > 0) {
    text("Netto:", col.price, { size: 10 });
    text(formatPrice(data.netTotal), col.sum, { size: 10 });
    y -= 16;
    for (const row of data.vatBreakdown ?? []) {
      text(`MwSt. ${row.rate.toFixed(0)} %:`, col.price, { size: 10 });
      text(formatPrice(row.vat), col.sum, { size: 10 });
      y -= 16;
    }
    y -= 6;
    text("Gesamt:", col.price, { size: 11, useFont: bold });
    text(formatPrice(data.grossTotal), col.sum, { size: 11, useFont: bold });
    y -= 28;
  } else {
    text("Gesamt netto:", col.price, { size: 11, useFont: bold });
    text(formatPrice(data.grossTotal), col.sum, { size: 11, useFont: bold });
    y -= 28;
  }

  // Fußbereich: Zahlungsziel, Steuernummer/USt-IdNr., Bankverbindung
  newPageIfNeeded(MARGIN + 60);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 16;
  text(
    data.paymentNote ??
      `Zahlbar innerhalb ${company.payment_terms_days} Tagen ohne Abzug.`,
    MARGIN,
    { size: 8, color: MUTED },
  );
  y -= 12;
  const taxLine = [
    company.tax_number ? `Steuernummer ${company.tax_number}` : null,
    company.vat_id ? `USt-IdNr. ${company.vat_id}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (taxLine) {
    text(taxLine, MARGIN, { size: 8, color: MUTED });
    y -= 12;
  }
  const bankLine = [
    company.bank_name,
    company.iban,
    company.bic,
  ]
    .filter(Boolean)
    .join(" · ");
  if (bankLine) {
    text(bankLine, MARGIN, { size: 8, color: MUTED });
    y -= 12;
  }
  if (data.footerNote) {
    text(data.footerNote, MARGIN, { size: 8, color: MUTED });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

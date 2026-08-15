import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Order } from "@/lib/types";
import { formatDate, formatPrice, formatQuantity } from "@/lib/format";

/**
 * Einfache PDF-Erzeugung mit pdf-lib statt @react-pdf/renderer oder
 * Puppeteer: keine Font-/Browser-Abhängigkeiten, läuft ohne Zusatzkonfiguration
 * in einer Vercel Function. Reicht für eine reine Positions-/Summentabelle.
 *
 * Zeigt nur den Netto-Warenwert – kein eigenes MwSt.-Konzept, da im Shop
 * bislang ausschließlich mit Nettopreisen gerechnet wird (siehe
 * lib/pricing.ts / Order.total_amount).
 */

const PAGE_WIDTH = 595.28; // A4 in pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.45, 0.48, 0.53);
const LINE = rgb(0.85, 0.85, 0.87);

export async function generateInvoicePdf(
  order: Order,
  invoiceNumber: string,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

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
  text("LIDER Berlin Groß- und Einzelhandel", MARGIN, { size: 13, useFont: bold });
  y -= 16;
  text("[Anschrift bitte in lib/invoice.ts ergänzen]", MARGIN, { size: 9, color: MUTED });
  y -= 34;

  // Rechnungskopf
  text(`Rechnung ${invoiceNumber}`, MARGIN, { size: 16, useFont: bold });
  y -= 20;
  text(`Bestellung: ${order.order_number}`, MARGIN, { size: 10, color: MUTED });
  y -= 14;
  text(`Rechnungsdatum: ${formatDate(new Date().toISOString())}`, MARGIN, {
    size: 10,
    color: MUTED,
  });
  y -= 34;

  // Rechnungsadresse
  const customer = order.customer;
  text("Rechnungsadresse", MARGIN, { size: 10, useFont: bold });
  y -= 14;
  text(customer?.company_name || customer?.full_name || "–", MARGIN, { size: 10 });
  y -= 13;
  if (customer?.billing_street) {
    text(customer.billing_street, MARGIN, { size: 10 });
    y -= 13;
  }
  const cityLine = [customer?.billing_zip, customer?.billing_city]
    .filter(Boolean)
    .join(" ");
  if (cityLine) {
    text(cityLine, MARGIN, { size: 10 });
    y -= 13;
  }
  y -= 20;

  // Positionstabelle
  const col = { name: MARGIN, qty: 330, price: 400, sum: 475 };
  text("Artikel", col.name, { size: 9, useFont: bold, color: MUTED });
  text("Menge", col.qty, { size: 9, useFont: bold, color: MUTED });
  text("Preis/Stk.", col.price, { size: 9, useFont: bold, color: MUTED });
  text("Summe", col.sum, { size: 9, useFont: bold, color: MUTED });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 16;

  for (const item of order.items ?? []) {
    newPageIfNeeded(MARGIN + 60);
    text(`${item.product_name} (${item.product_sku})`, col.name, { size: 9 });
    text(formatQuantity(item.quantity), col.qty, { size: 9 });
    text(formatPrice(item.unit_price), col.price, { size: 9 });
    text(formatPrice(item.subtotal), col.sum, { size: 9 });
    y -= 16;
  }

  newPageIfNeeded(MARGIN + 40);
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LINE,
  });
  y -= 22;
  text("Gesamt netto:", col.price, { size: 11, useFont: bold });
  text(formatPrice(order.total_amount), col.sum, { size: 11, useFont: bold });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

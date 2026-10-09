import "server-only";
import { INVOICE_BUCKET } from "@/lib/constants";
import { sendEmail } from "@/lib/email";
import { stornoEmail } from "@/lib/emails/storno";
import {
  buildManualInvoicePdfData,
  buildOrderInvoicePdfData,
  buildPosSaleInvoicePdfData,
  generateInvoicePdf,
  type InvoicePdfData,
} from "@/lib/invoice";
import { getOrder } from "@/lib/queries/orders";
import { getPosSale } from "@/lib/queries/pos";
import { getCompanySettings } from "@/lib/queries/settings";
import { stornoPdfData } from "@/lib/storno";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppUser, Invoice, InvoiceItem, Order } from "@/lib/types";

/**
 * Stornorechnung als PDF erzeugen, ablegen und – auf Wunsch – verschicken.
 *
 * Die Rechnung ist zu diesem Zeitpunkt schon storniert (cancel_invoice() hat
 * Nummer und Zeitpunkt vergeben). Geht hier etwas schief, bleibt die
 * Stornierung bestehen und das PDF lässt sich neu erzeugen – deshalb ist das
 * eine eigene Funktion und nicht Teil der Datenbankfunktion.
 *
 * Das Original wird mit denselben build*PdfData() neu aufgebaut wie beim
 * Stellen (mit dem damaligen Rechnungsdatum) und dann nur umgekehrt
 * (lib/storno.ts).
 */
export async function erzeugeStornoRechnung(
  invoiceId: string,
  opts: { mail: boolean },
): Promise<{ ok: true; email: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("invoices")
    .select("*, customer:users (*)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Die Rechnung wurde nicht gefunden." };

  const invoice = row as unknown as Invoice & { customer: AppUser };
  if (invoice.status !== "cancelled" || !invoice.storno_number || !invoice.cancelled_at) {
    return { ok: false, error: "Die Rechnung ist nicht storniert." };
  }
  const company = await getCompanySettings();

  let original: InvoicePdfData | null = null;
  if (invoice.type === "pos" && invoice.pos_sale_id) {
    const sale = await getPosSale(invoice.pos_sale_id);
    if (sale?.customer) {
      original = buildPosSaleInvoicePdfData(
        invoice.invoice_number,
        invoice.issued_at,
        sale,
        sale.items ?? [],
        sale.customer,
        company,
        sale.customer_id ? false : company.pos_prices_gross,
      );
    }
  } else if (invoice.type === "manual") {
    const { data: positionen } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at");
    original = buildManualInvoicePdfData(
      invoice,
      (positionen ?? []) as unknown as InvoiceItem[],
      invoice.customer,
      company,
    );
  } else if (invoice.order_id) {
    const order = await getOrder(invoice.order_id);
    if (order) {
      const voll: Order = { ...order, customer: invoice.customer };
      original = buildOrderInvoicePdfData(
        voll,
        invoice.invoice_number,
        company,
        invoice.issued_at,
      );
    }
  }
  if (!original) return { ok: false, error: "Die Rechnungsdaten konnten nicht geladen werden." };

  const pdf = await generateInvoicePdf(
    stornoPdfData(original, {
      stornoNummer: invoice.storno_number,
      stornoDatum: invoice.cancelled_at,
      originalNummer: invoice.invoice_number,
      originalDatum: invoice.issued_at,
      grund: invoice.storno_reason,
    }),
  );

  // Unter <Rechnungs-Id>/…, wo die Leserechte des Kunden schon greifen
  // (Storage-Richtlinie „invoices read own“, Migration 016).
  const pfad = `${invoice.id}/${invoice.storno_number}.pdf`;
  const admin = createAdminClient();
  const { error: upload } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
  if (upload) {
    console.error("[storno] Upload:", upload.message);
    return { ok: false, error: "Das PDF konnte nicht abgelegt werden." };
  }
  await admin.from("invoices").update({ storno_file_path: pfad }).eq("id", invoice.id);

  let verschickt = false;
  if (opts.mail) {
    try {
      const mail = stornoEmail({
        originalNummer: invoice.invoice_number,
        stornoNummer: invoice.storno_number,
        brutto: original.grossTotal,
        grund: invoice.storno_reason,
        orderId: invoice.order_id,
      });
      await sendEmail({
        to: invoice.customer.email,
        ...mail,
        attachments: [{ filename: `${invoice.storno_number}.pdf`, content: pdf }],
      });
      verschickt = true;
    } catch (fehler) {
      console.error("[storno] Mail:", fehler);
    }
  }
  return { ok: true, email: verschickt };
}

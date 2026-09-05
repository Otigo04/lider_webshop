import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrder } from "@/lib/queries/orders";
import { getCompanySettings } from "@/lib/queries/settings";
import {
  buildManualInvoicePdfData,
  buildOrderInvoicePdfData,
  generateInvoicePdf,
} from "@/lib/invoice";
import { sendEmail } from "@/lib/email";
import { orderConfirmationEmail } from "@/lib/emails/order-confirmation";
import { invoiceEmail } from "@/lib/emails/invoice";
import { manualInvoiceEmail } from "@/lib/emails/manual-invoice";
import { INVOICE_BUCKET } from "@/lib/constants";
import type { AppUser, Invoice, InvoiceItem, Order } from "@/lib/types";

/**
 * Rechnung zu einer Bestellung erzeugen, hochladen und verschicken – sowohl
 * für den normalen Checkout (lib/actions/orders.ts) als auch für eine
 * Bestellung, die der Admin manuell für einen Kunden angelegt hat
 * (lib/actions/admin-invoices.ts). Fehler landen nur im Log: eine bereits
 * angelegte Bestellung darf daran nie scheitern.
 */
export async function generateAndSendOrderInvoice(
  orderId: string,
  customer: AppUser,
  options: { sendOrderConfirmation?: boolean } = {},
): Promise<void> {
  const order = await getOrder(orderId);
  if (!order) return;

  const fullOrder: Order = { ...order, customer };

  if (options.sendOrderConfirmation ?? true) {
    const confirmation = orderConfirmationEmail(fullOrder);
    await sendEmail({ to: customer.email, ...confirmation });
  }

  const supabase = await createClient();
  const { data: invoiceData, error: invoiceError } = await supabase.rpc(
    "create_invoice_for_order",
    { p_order_id: orderId },
  );

  if (invoiceError || !invoiceData) {
    console.error("[rechnung] create_invoice_for_order:", invoiceError?.message);
    return;
  }

  const invoice = invoiceData as { id: string; invoice_number: string };
  const company = await getCompanySettings();
  const pdfBytes = await generateInvoicePdf(
    buildOrderInvoicePdfData(fullOrder, invoice.invoice_number, company),
  );
  const filePath = `${orderId}/${invoice.invoice_number}.pdf`;

  // Upload über den Service-Key: Kunden haben bewusst keine Schreibrechte auf
  // den invoices-Bucket (siehe supabase/migrations/015_rechnungen.sql).
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("[rechnung] Upload:", uploadError.message);
    return;
  }

  await admin.from("invoices").update({ file_path: filePath }).eq("id", invoice.id);

  const invoiceMail = invoiceEmail(fullOrder, invoice.invoice_number);
  await sendEmail({
    to: customer.email,
    ...invoiceMail,
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBytes }],
  });
}

/**
 * PDF erzeugen, hochladen und verschicken für eine freie Rechnung ohne
 * Bestellbezug (lib/actions/admin-invoices.ts: createManualInvoice). Die
 * invoices-Zeile und ihre Positionen existieren zu diesem Zeitpunkt bereits
 * (angelegt über die DB-Funktion create_manual_invoice).
 */
export async function generateAndSendManualInvoice(invoiceId: string): Promise<void> {
  const supabase = await createClient();

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, customer:users (*)")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoiceRow) {
    console.error("[rechnung] Rechnung laden:", invoiceError?.message);
    return;
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at");

  if (itemsError) {
    console.error("[rechnung] Positionen laden:", itemsError.message);
    return;
  }

  const invoice = invoiceRow as unknown as Invoice & { customer: AppUser };
  const items = (itemRows ?? []) as unknown as InvoiceItem[];
  const company = await getCompanySettings();

  const pdfBytes = await generateInvoicePdf(
    buildManualInvoicePdfData(invoice, items, invoice.customer, company),
  );
  const filePath = `${invoiceId}/${invoice.invoice_number}.pdf`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("[rechnung] Upload:", uploadError.message);
    return;
  }

  await admin.from("invoices").update({ file_path: filePath }).eq("id", invoiceId);

  const mail = manualInvoiceEmail(invoice);
  await sendEmail({
    to: invoice.customer.email,
    ...mail,
    attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBytes }],
  });
}

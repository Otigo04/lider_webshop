import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrder } from "@/lib/queries/orders";
import { getCompanySettings } from "@/lib/queries/settings";
import {
  buildOrderInvoicePdfData,
  generateInvoicePdf,
} from "@/lib/invoice";
import { sendEmail } from "@/lib/email";
import { orderConfirmationEmail } from "@/lib/emails/order-confirmation";
import { invoiceEmail } from "@/lib/emails/invoice";
import { INVOICE_BUCKET } from "@/lib/constants";
import type { AppUser, Order } from "@/lib/types";

/**
 * Rechnung zu einer Bestellung erzeugen, hochladen und verschicken – sowohl
 * für den normalen Checkout (lib/actions/orders.ts) als auch für eine
 * Bestellung, die der Admin manuell für einen Kunden angelegt hat
 * (lib/actions/admin-invoices.ts). Fehler landen nur im Log: eine bereits
 * angelegte Bestellung darf daran nie scheitern.
 *
 * `customer` ist null bei einem Beleg ohne Konto (Migration 080): Name und
 * Anschrift stehen dann an der Bestellung, es gibt keine Mailadresse – die
 * Rechnung wird gestellt und abgelegt, aber nicht verschickt.
 */
export async function generateAndSendOrderInvoice(
  orderId: string,
  customer: AppUser | null,
  options: { sendOrderConfirmation?: boolean; paymentNote?: string | null } = {},
): Promise<void> {
  const order = await getOrder(orderId);
  if (!order) return;

  const fullOrder: Order = { ...order, customer: customer ?? undefined };
  // Die Firmendaten stehen in beiden Mails (Bankverbindung, Anschrift) und im
  // PDF – einmal laden reicht.
  const company = await getCompanySettings();

  // Der Mailversand steht vor der Rechnung, darf sie aber nicht aufhalten:
  // wirft der Versand (Netzfehler beim Anbieter), entstünde sonst eine
  // Bestellung ganz ohne Rechnung.
  if (customer && (options.sendOrderConfirmation ?? true)) {
    try {
      const confirmation = orderConfirmationEmail(fullOrder, company);
      await sendEmail({ to: customer.email, ...confirmation });
    } catch (fehler) {
      console.error("[rechnung] Bestellbestätigung:", fehler);
    }
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
  const zahlungsvermerk = options.paymentNote?.trim() || null;
  if (zahlungsvermerk) {
    const { error: noteError } = await createAdminClient()
      .from("invoices")
      .update({ payment_note: zahlungsvermerk })
      .eq("id", invoice.id);
    if (noteError) console.error("[rechnung] Zahlungsvermerk:", noteError.message);
  }
  const pdfBytes = await generateInvoicePdf(
    buildOrderInvoicePdfData(
      fullOrder,
      invoice.invoice_number,
      company,
      undefined,
      zahlungsvermerk,
    ),
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

  if (!customer) return;

  try {
    const invoiceMail = invoiceEmail(fullOrder, invoice.invoice_number, company);
    await sendEmail({
      to: customer.email,
      ...invoiceMail,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: pdfBytes }],
    });
  } catch (fehler) {
    // Die Rechnung liegt zu diesem Zeitpunkt gestellt und hochgeladen vor.
    console.error("[rechnung] Rechnungsmail:", fehler);
  }
}

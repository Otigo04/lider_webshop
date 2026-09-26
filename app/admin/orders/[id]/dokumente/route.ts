import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { INVOICE_BUCKET } from "@/lib/constants";
import {
  buildDeliveryNotePdfData,
  buildOrderInvoicePdfData,
  generateInvoicePdf,
  mergePdfs,
} from "@/lib/invoice";
import { getInvoiceForOrder, getOrderWithCustomer } from "@/lib/queries/orders";
import { getCompanySettings } from "@/lib/queries/settings";
import { createClient } from "@/lib/supabase/server";
import type { CompanySettings, Invoice, Order } from "@/lib/types";

/**
 * Papiere zu einer Bestellung: Rechnung, Lieferschein oder beides in einer
 * Datei.
 *
 * Route Handler und kein Knopf mit Server Action: das Ergebnis ist eine Datei,
 * die der Browser anzeigen und drucken soll. Als Link braucht das keine Zeile
 * Client-Logik – und `Content-Disposition: inline` heißt, dass der Betrachter
 * aufgeht und Strg+P reicht, statt dass die Datei in den Download-Ordner
 * fällt und von Hand geöffnet werden muss.
 *
 * `?art=beides` (Vorgabe) legt Rechnung und Lieferschein in ein PDF. Beim
 * Versand an einen Händler gehören beide Blätter in denselben Vorgang; zwei
 * Dateien hießen zweimal öffnen und zweimal drucken.
 *
 * Die Rechnung kommt, wenn möglich, als gespeicherte Datei aus dem Bucket –
 * das ist Blatt für Blatt dasselbe Dokument, das der Kunde per Mail bekommen
 * hat. Erst wenn die Datei fehlt, wird sie aus der Bestellung neu gezeichnet,
 * dann aber mit dem Ausstellungsdatum der Rechnungszeile: eine Rechnung, die
 * beim zweiten Ausdruck ein neues Datum trägt, wäre ein anderes Dokument unter
 * derselben Nummer.
 */

type Art = "rechnung" | "lieferschein" | "beides";

function istArt(wert: string | null): wert is Art {
  return wert === "rechnung" || wert === "lieferschein" || wert === "beides";
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/admin/orders/[id]/dokumente">,
) {
  await requireAdmin();

  const { id } = await params;
  const roh = new URL(request.url).searchParams.get("art");
  const art: Art = istArt(roh) ? roh : "beides";

  const order = await getOrderWithCustomer(id);
  if (!order) {
    return new NextResponse("Bestellung nicht gefunden.", { status: 404 });
  }

  const [company, invoice] = await Promise.all([
    getCompanySettings(),
    getInvoiceForOrder(id),
  ]);

  // Die Vorlagen nehmen `Order` mit optionalem Kunden, die Abfrage liefert ihn
  // als `null` – einmal umgeformt statt an jeder Aufrufstelle.
  const bestellung: Order = { ...order, customer: order.customer ?? undefined };

  const teile: Buffer[] = [];

  if (art !== "lieferschein") {
    if (!invoice) {
      return new NextResponse(
        "Zu dieser Bestellung ist noch keine Rechnung gestellt.",
        { status: 404 },
      );
    }
    teile.push(await rechnungsPdf(bestellung, invoice, company));
  }

  if (art !== "rechnung") {
    teile.push(
      await generateInvoicePdf(
        buildDeliveryNotePdfData(bestellung, company, invoice?.invoice_number),
      ),
    );
  }

  const pdf = await mergePdfs(teile);
  const name =
    art === "rechnung"
      ? `${invoice?.invoice_number ?? order.order_number}.pdf`
      : art === "lieferschein"
        ? `Lieferschein-${order.order_number}.pdf`
        : `${order.order_number}-Rechnung-und-Lieferschein.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      // Preise und Anschriften können sich ändern; ein Papier aus dem Cache
      // wäre im Zweifel das falsche.
      "Cache-Control": "no-store",
    },
  });
}

/** Gespeicherte Rechnung, sonst aus der Bestellung neu gezeichnet. */
async function rechnungsPdf(
  order: Order,
  invoice: Invoice,
  company: CompanySettings,
): Promise<Buffer> {
  if (invoice.file_path) {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(INVOICE_BUCKET)
      .download(invoice.file_path);

    if (!error && data) {
      return Buffer.from(await data.arrayBuffer());
    }
    console.error(
      "[rechnung] Gespeichertes PDF nicht lesbar, wird neu erzeugt:",
      error?.message ?? invoice.file_path,
    );
  }

  return generateInvoicePdf(
    buildOrderInvoicePdfData(
      { ...order, customer: order.customer ?? undefined },
      invoice.invoice_number,
      company,
      invoice.issued_at,
    ),
  );
}

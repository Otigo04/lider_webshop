import "server-only";
import type { CompanySettings, Order } from "@/lib/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/types";
import { formatDateTime, formatPrice, toNumber } from "@/lib/format";
import { steuer } from "@/lib/vat";
import { buttonHtml, siteUrl, wrapEmail } from "@/lib/emails/layout";

/**
 * Nur die Felder, die in der Mail vorkommen. Die Admin-Ansicht lädt ihre
 * Bestellungen mit einem abgespeckten Kunden-Join (AdminOrderRow) – gegen den
 * vollen Order-Typ ließe sie sich hier nicht übergeben, obwohl alles Nötige
 * drinsteht.
 */
type Bestelldaten = Pick<
  Order,
  "id" | "order_number" | "total_amount" | "vat_rate" | "payment_method" | "pickup_at"
>;

/**
 * "Ihre Bestellung liegt bereit." Die Mail, die der Admin mit einem Klick
 * auslöst. Sie muss ohne Rückfrage beantworten: wo, wann, und was noch offen
 * ist – sonst ruft der Kunde an, und genau das soll sie ersparen.
 */
export function orderReadyEmail(
  order: Bestelldaten,
  company?: CompanySettings,
): { subject: string; html: string } {
  const betraege = steuer(toNumber(order.total_amount), toNumber(order.vat_rate));

  const anschrift = [
    company?.company_name,
    company?.address_street,
    [company?.address_zip, company?.address_city].filter(Boolean).join(" "),
  ].filter(Boolean);

  const termin = order.pickup_at
    ? `<p style="font-size:14px;color:#374151;margin-top:12px;">
         Ihr Wunschtermin <strong>${formatDateTime(order.pickup_at)}</strong> ist notiert.
       </p>`
    : "";

  const zahlung =
    order.payment_method === "transfer"
      ? `<p style="font-size:14px;color:#374151;margin-top:12px;">
           Der Rechnungsbetrag von <strong>${formatPrice(betraege.brutto)}</strong>
           ist per Überweisung zu begleichen.
         </p>`
      : `<p style="font-size:14px;color:#374151;margin-top:12px;">
           Zu zahlen bei Abholung: <strong>${formatPrice(betraege.brutto)}</strong>
           (${PAYMENT_METHOD_LABELS[order.payment_method].toLowerCase()}).
         </p>`;

  const body = `
    <p style="font-size:14px;color:#374151;">
      Ihre Bestellung <strong>${order.order_number}</strong> ist kommissioniert und
      liegt zur Abholung bereit.
    </p>
    ${
      anschrift.length > 0
        ? `<p style="font-size:14px;color:#374151;margin-top:12px;">Abholung bei:<br/><strong>${anschrift.join("<br/>")}</strong></p>`
        : ""
    }
    ${termin}
    ${zahlung}
    ${
      company?.phone
        ? `<p style="font-size:13px;color:#6b7280;margin-top:12px;">Rückfragen: ${company.phone}</p>`
        : ""
    }
    <p style="margin-top:24px;">${buttonHtml(siteUrl(`/orders/${order.id}`), "Bestellung ansehen")}</p>
  `;

  return {
    subject: `Bestellung ${order.order_number} liegt zur Abholung bereit`,
    html: wrapEmail("Abholbereit", body),
  };
}

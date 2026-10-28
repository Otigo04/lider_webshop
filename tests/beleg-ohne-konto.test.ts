import { test } from "node:test";
import assert from "node:assert/strict";
import {
  belegKunde,
  buildDeliveryNotePdfData,
  buildOrderInvoicePdfData,
  positionsZusatz,
} from "@/lib/invoice";
import type { CompanySettings, Order } from "@/lib/types";

const firma = { company_name: "LIDER" } as unknown as CompanySettings;

function bestellung(mehr: Partial<Order> = {}): Order {
  return {
    id: "o1",
    customer_id: null,
    customer_label: "Muster Handel e. K.",
    customer_street: "Hauptstr. 1",
    customer_zip: "10115",
    customer_city: "Berlin",
    order_number: "LG-2026-00001",
    status: "confirmed",
    total_amount: 30,
    notes: null,
    delivery_method: "pickup",
    payment_method: "transfer",
    vat_rate: 19,
    delivery_address: null,
    delivery_name: null,
    delivery_street: null,
    delivery_zip: null,
    delivery_city: null,
    delivery_country: null,
    pickup_at: null,
    ready_at: null,
    created_at: "2026-10-28T10:00:00Z",
    updated_at: "2026-10-28T10:00:00Z",
    items: [
      {
        id: "i1",
        order_id: "o1",
        product_variant_id: null,
        product_name: "Lieferung",
        product_sku: "",
        quantity: 3,
        unit_price: 10,
        subtotal: 30,
        is_preorder: false,
        barcode: "4006381333931",
        created_at: "2026-10-28T10:00:00Z",
      },
    ],
    ...mehr,
  } as Order;
}

test("Ohne Konto steht der Name von der Bestellung auf dem Beleg", () => {
  const k = belegKunde(bestellung());
  assert.equal(k.name, "Muster Handel e. K.");
  assert.equal(k.street, "Hauptstr. 1");
  assert.equal(k.zip, "10115");
  assert.equal(k.city, "Berlin");
  assert.equal(k.number, null);
  assert.equal(k.vatId, null);
});

test("Mit Konto gilt das Profil, nicht die Angaben an der Bestellung", () => {
  const konto = {
    company_name: "Konto GmbH",
    full_name: "Anna",
    customer_number: "K-7",
    billing_street: "Weg 2",
    billing_zip: "80331",
    billing_city: "München",
    vat_id: "DE123",
  } as never;
  const k = belegKunde(bestellung({ customer: konto, customer_id: "c1", customer_label: null }));
  assert.equal(k.name, "Konto GmbH");
  assert.equal(k.street, "Weg 2");
  assert.equal(k.number, "K-7");
  assert.equal(k.vatId, "DE123");
});

test("Lieferschein ohne Konto: Empfänger aus dem Namen, keine Preise, Bestellnummer", () => {
  const pdf = buildDeliveryNotePdfData(bestellung(), firma, null);
  assert.equal(pdf.documentTitle, "Lieferschein");
  assert.equal(pdf.invoiceNumber, "LG-2026-00001");
  assert.equal(pdf.hidePrices, true);
  assert.equal(pdf.customerName, "Muster Handel e. K.");
  assert.equal(pdf.customerStreet, "Hauptstr. 1");
  assert.equal(pdf.customerCity, "10115 Berlin");
});

test("Rechnung ohne Konto trägt Name und Anschrift", () => {
  const pdf = buildOrderInvoicePdfData(bestellung(), "LD0000001", firma);
  assert.equal(pdf.customerName, "Muster Handel e. K.");
  assert.equal(pdf.customerStreet, "Hauptstr. 1");
  assert.equal(pdf.customerZip, "10115");
  assert.equal(pdf.customerCity, "Berlin");
  assert.equal(pdf.items[0].barcode, "4006381333931");
});

test("Zeile unter der Bezeichnung: Artikelnummer und/oder Strichcode", () => {
  assert.equal(positionsZusatz({ sku: "12-0001" }), "Art.-Nr. 12-0001");
  assert.equal(positionsZusatz({ barcode: "4006381333931" }), "EAN 4006381333931");
  assert.equal(
    positionsZusatz({ sku: "12-0001", barcode: "4006381333931" }),
    "Art.-Nr. 12-0001 · EAN 4006381333931",
  );
  assert.equal(positionsZusatz({ sku: "" }), null);
});

test("Lieferschein mit Preisen: Preise je Position, Nettosumme, keine Steuer", () => {
  const o = bestellung({ customer_id: "c1", customer_discount_percent: 0, customer_discount_amount: 0 } as Partial<Order>);
  const pdf = buildDeliveryNotePdfData(o, firma, null, { mitPreisen: true });
  assert.equal(pdf.documentTitle, "Lieferschein");
  assert.equal(pdf.hidePrices, false);
  assert.equal(pdf.nurNetto, true);
  assert.equal(pdf.items[0].unitPrice, 10);
  assert.equal(pdf.items[0].subtotal, 30);
  assert.equal(pdf.netTotal, 30);
  assert.equal(pdf.vatTotal, 0);
  assert.equal(pdf.grossTotal, 30, "Gesamtsumme ist die Nettosumme");
  assert.equal(pdf.vatBreakdown, undefined);
  assert.match(pdf.paymentNote ?? "", /ohne Umsatzsteuer/);
});

test("Lieferschein mit Preisen: die Sonderkondition steht als Abzugszeile, die Summe bleibt netto", () => {
  const o = bestellung({
    total_amount: 27,
    subtotal_amount: 30,
    customer_discount_percent: 10,
    customer_discount_amount: 3,
  } as Partial<Order>);
  const pdf = buildDeliveryNotePdfData(o, firma, null, { mitPreisen: true });
  const abzug = pdf.items.find((i) => i.abzug);
  assert.equal(abzug?.subtotal, -3);
  assert.equal(pdf.netTotal, 27);
});

test("Lieferschein ohne Preise bleibt ohne Beträge", () => {
  const pdf = buildDeliveryNotePdfData(bestellung(), firma, null);
  assert.equal(pdf.hidePrices, true);
  assert.equal(pdf.nurNetto, false);
  assert.equal(pdf.items[0].unitPrice, 0);
  assert.equal(pdf.netTotal, 0);
});

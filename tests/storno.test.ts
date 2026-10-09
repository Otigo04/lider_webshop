import { test } from "node:test";
import assert from "node:assert/strict";
import { stornoPdfData } from "@/lib/storno";
import type { InvoicePdfData } from "@/lib/invoice";

const original = {
  invoiceNumber: "LD0000042",
  issuedAt: "2026-09-01T10:00:00Z",
  reference: "Bestellung LG-2026-00012",
  customerName: "Muster GmbH",
  items: [
    { description: "Batterie", quantity: 10, unitPrice: 2.5, subtotal: 25 },
    { description: "Sonderkondition 10 %", quantity: 1, unitPrice: -2.5, subtotal: -2.5, abzug: true },
  ],
  netTotal: 22.5,
  vatTotal: 4.28,
  grossTotal: 26.78,
  vatBreakdown: [{ rate: 19, net: 22.5, vat: 4.28 }],
  deliveryAddress: "Lager\n10115 Berlin",
  company: {},
} as unknown as InvoicePdfData;

const opts = {
  stornoNummer: "LS0000001",
  stornoDatum: "2026-10-09T08:00:00Z",
  originalNummer: "LD0000042",
  originalDatum: "2026-09-01T10:00:00Z",
};

test("Storno kehrt Beträge um, Mengen bleiben", () => {
  const s = stornoPdfData(original, opts);
  assert.equal(s.documentTitle, "Stornorechnung");
  assert.equal(s.invoiceNumber, "LS0000001");
  assert.equal(s.netTotal, -22.5);
  assert.equal(s.vatTotal, -4.28);
  assert.equal(s.grossTotal, -26.78);
  assert.equal(s.items[0].quantity, 10);
  assert.equal(s.items[0].unitPrice, -2.5);
  assert.equal(s.items[0].subtotal, -25);
  // Der Rabattabzug wird beim Storno zur Gutschrift.
  assert.equal(s.items[1].subtotal, 2.5);
  assert.deepEqual(s.vatBreakdown, [{ rate: 19, net: -22.5, vat: -4.28 }]);
});

test("Storno nennt Original, Grund und entfernt Lieferanschrift", () => {
  const s = stornoPdfData(original, { ...opts, grund: "Falsche Ware" });
  assert.match(s.reference ?? "", /Rechnung LD0000042 vom 01\.09\.2026/);
  assert.match(s.reference ?? "", /Grund: Falsche Ware/);
  assert.match(s.reference ?? "", /Bestellung LG-2026-00012/);
  assert.equal(s.deliveryAddress, null);
});

test("Doppeltes Storno ergibt wieder das Original (Beträge)", () => {
  const zweimal = stornoPdfData(stornoPdfData(original, opts), opts);
  assert.equal(zweimal.grossTotal, 26.78);
  assert.equal(zweimal.items[0].subtotal, 25);
});

test("Betrag 0 wird nicht zu -0", () => {
  const leer = { ...original, vatTotal: 0 } as InvoicePdfData;
  assert.ok(Object.is(stornoPdfData(leer, opts).vatTotal, 0));
});

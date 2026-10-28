import { test } from "node:test";
import assert from "node:assert/strict";
import {
  angebotAusDaten,
  angebotBedingung,
  angebotSatz,
  angebotTitel,
  type NewsletterAngebot,
} from "@/lib/newsletter-angebot";

const fuenfEuro: NewsletterAngebot = {
  kind: "fixed",
  value: 5,
  min_order_amount: 50,
  nur_erstbestellung: true,
  begrenzt: false,
};

test("Der Standardgutschein: 5 € auf die erste Bestellung ab 50 €", () => {
  assert.equal(angebotTitel(fuenfEuro), "5 € Gutschein auf Ihre erste Bestellung");
  assert.equal(angebotBedingung(fuenfEuro), "ab 50 € Warenwert (netto)");
  assert.equal(
    angebotSatz(fuenfEuro),
    "5 € Gutschein auf Ihre erste Bestellung ab 50 € Warenwert (netto)",
  );
});

test("Prozent, ohne Mindestwert und ohne Erstbestellung", () => {
  const a: NewsletterAngebot = {
    kind: "percent",
    value: 10,
    min_order_amount: 0,
    nur_erstbestellung: false,
    begrenzt: false,
  };
  assert.equal(angebotSatz(a), "10 % Rabatt auf Ihre Bestellung");
});

test("Cent erscheinen nur, wenn welche da sind", () => {
  const a = { ...fuenfEuro, value: 7.5, min_order_amount: 49.9 };
  assert.equal(angebotTitel(a), "7,50 € Gutschein auf Ihre erste Bestellung");
  assert.equal(angebotBedingung(a), "ab 49,90 € Warenwert (netto)");
});

test("Auf Warengruppen begrenzt wird genannt", () => {
  assert.equal(
    angebotBedingung({ ...fuenfEuro, begrenzt: true }),
    "ab 50 € Warenwert (netto), für ausgewählte Warengruppen",
  );
});

test("Antwort der Datenbank: lesbar oder kein Angebot", () => {
  assert.deepEqual(
    angebotAusDaten({
      kind: "fixed",
      value: "5.00",
      min_order_amount: "50.00",
      nur_erstbestellung: true,
      begrenzt: false,
    }),
    fuenfEuro,
  );
  assert.equal(angebotAusDaten(null), null);
  assert.equal(angebotAusDaten({ kind: "bonus", value: 5 }), null);
  assert.equal(angebotAusDaten({ kind: "fixed", value: 0 }), null);
});

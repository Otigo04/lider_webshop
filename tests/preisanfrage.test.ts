import { test } from "node:test";
import assert from "node:assert/strict";
import { PREIS_ANFRAGE_STANDARDTEXT, preisAnfrageLink, preisAnfrageText } from "@/lib/preisanfrage";

test("Mail an die Firmenadresse mit Name und Artikelnummer", () => {
  const link = preisAnfrageLink("info@lider.example", "Anti Stress Fisch", "12-0034");
  assert.ok(link.startsWith("mailto:info@lider.example?subject="));
  const betreff = new URLSearchParams(link.split("?")[1]).get("subject");
  assert.equal(betreff, "Preisanfrage: Anti Stress Fisch (12-0034)");
  const text = new URLSearchParams(link.split("?")[1]).get("body") ?? "";
  assert.match(text, /Artikelnummer: 12-0034/);
});

test("Sonderzeichen im Namen bleiben im Link heil", () => {
  const link = preisAnfrageLink("info@lider.example", "Tom & Jerry, 100 % \"neu\"", "A-1");
  const betreff = new URLSearchParams(link.split("?")[1]).get("subject");
  assert.equal(betreff, 'Preisanfrage: Tom & Jerry, 100 % "neu" (A-1)');
});

test("Ohne brauchbare Adresse führt der Knopf auf die Kontaktseite", () => {
  assert.equal(preisAnfrageLink(null, "x", "y"), "/kontakt");
  assert.equal(preisAnfrageLink("", "x", "y"), "/kontakt");
  assert.equal(preisAnfrageLink("a b@c.de", "x", "y"), "/kontakt");
});

test("Eigener Text geht vor, leer heißt Standardtext", () => {
  assert.equal(preisAnfrageText("Nur im Karton zu 12 Stück."), "Nur im Karton zu 12 Stück.");
  assert.equal(preisAnfrageText("  Text  "), "Text");
  assert.equal(preisAnfrageText(""), PREIS_ANFRAGE_STANDARDTEXT);
  assert.equal(preisAnfrageText("   \n "), PREIS_ANFRAGE_STANDARDTEXT);
  assert.equal(preisAnfrageText(null), PREIS_ANFRAGE_STANDARDTEXT);
  assert.equal(preisAnfrageText(undefined), PREIS_ANFRAGE_STANDARDTEXT);
});

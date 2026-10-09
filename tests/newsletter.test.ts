import { test } from "node:test";
import assert from "node:assert/strict";
import { dokumentSchema, neuerBlock, sichererLink, startDokument } from "@/lib/newsletter";
import { formatiereText } from "@/lib/newsletter-mail";
import { abmeldeToken, abmeldeTokenGueltig } from "@/lib/newsletter-token";

const BASIS = "https://shop.example";

test("Links: Shop-Pfade und https ja, javascript: nein", () => {
  assert.equal(sichererLink("/shop", BASIS), "https://shop.example/shop");
  assert.equal(sichererLink("https://x.de/a", BASIS), "https://x.de/a");
  assert.equal(sichererLink("mailto:a@b.de", BASIS), "mailto:a@b.de");
  assert.equal(sichererLink("javascript:alert(1)", BASIS), null);
  assert.equal(sichererLink("//evil.de", BASIS), null);
  assert.equal(sichererLink("  ", BASIS), null);
});

test("Text: Absätze, fett, Links – fremdes Markup wird maskiert", () => {
  const html = formatiereText("Hallo **Welt**\n\n[Shop](/shop) <script>x</script>", BASIS);
  assert.equal((html.match(/<p /g) ?? []).length, 2);
  assert.match(html, /<strong>Welt<\/strong>/);
  assert.match(html, /href="https:\/\/shop\.example\/shop"/);
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("Text: ein Link mit javascript: wird zu bloßem Text", () => {
  const html = formatiereText("[klick](javascript:alert(1))", BASIS);
  assert.ok(!html.includes("href"));
  assert.match(html, /klick/);
});

test("Startdokument ist gültig, jeder Baustein-Typ lässt sich erzeugen", () => {
  assert.ok(dokumentSchema.safeParse(startDokument()).success);
  for (const typ of ["ueberschrift", "text", "bild", "artikel", "auto", "button", "hinweis", "trenner"] as const) {
    const dok = { betreff: "x", vorschautext: "", blocks: [neuerBlock(typ)] };
    assert.ok(dokumentSchema.safeParse(dok).success, typ);
  }
});

test("Dokument: leerer Betreff und zu viele Bausteine werden abgewiesen", () => {
  assert.ok(!dokumentSchema.safeParse({ betreff: "  ", vorschautext: "", blocks: [] }).success);
  const viele = Array.from({ length: 61 }, () => neuerBlock("trenner"));
  assert.ok(!dokumentSchema.safeParse({ betreff: "x", vorschautext: "", blocks: viele }).success);
});

test("Abmelde-Token: passt nur zur eigenen Kennung", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  const b = "22222222-2222-2222-2222-222222222222";
  const t = abmeldeToken(a);
  assert.ok(abmeldeTokenGueltig(a, t));
  assert.ok(!abmeldeTokenGueltig(b, t));
  assert.ok(!abmeldeTokenGueltig(a, t + "x"));
  assert.ok(!abmeldeTokenGueltig(a, ""));
});

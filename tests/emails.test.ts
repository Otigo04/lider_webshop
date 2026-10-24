import assert from "node:assert/strict";
import { test } from "node:test";
import { newPasswordEmail, welcomeEmail } from "@/lib/emails/verification";

test("Willkommensmail nennt Anmeldename und Einmalpasswort", () => {
  const { subject, html } = welcomeEmail("kunde@example.de", "abcDEF23456789", "Erika Muster");
  assert.match(subject, /Willkommen/);
  assert.ok(html.includes("kunde@example.de"));
  assert.ok(html.includes("abcDEF23456789"));
  assert.ok(html.includes("Guten Tag Erika Muster,"));
  assert.ok(html.includes("/login"));
});

test("Name und Passwort werden maskiert", () => {
  const { html } = welcomeEmail("a@b.de", "<b>x</b>", '<script>alert("x")</script>');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("Neues-Passwort-Mail unterscheidet sich im Betreff", () => {
  const neu = newPasswordEmail("a@b.de", "pw12345678", null);
  assert.match(neu.subject, /neues Einmalpasswort/);
  assert.ok(neu.html.includes("Guten Tag,"));
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ANTWORT_ADRESSE,
  ABSENDER_STANDARD,
  absender,
} from "@/lib/email-adressen";
import { wrapEmail } from "@/lib/emails/layout";
import { welcomeEmail } from "@/lib/emails/verification";

const alterWert = process.env.EMAIL_FROM;
afterEach(() => {
  if (alterWert === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = alterWert;
});

test("Antworten gehen an o.tas@lider-berlin.de", () => {
  assert.equal(ANTWORT_ADRESSE, "o.tas@lider-berlin.de");
});

test("Standardabsender ist noreply@lider-berlin.de", () => {
  assert.equal(ABSENDER_STANDARD, "LIDER <noreply@lider-berlin.de>");
});

test("Absender: EMAIL_FROM hat Vorrang, sonst der Standard", () => {
  process.env.EMAIL_FROM = "LIDER <test@lider-berlin.de>";
  assert.equal(absender(), "LIDER <test@lider-berlin.de>");
  delete process.env.EMAIL_FROM;
  assert.equal(absender(), ABSENDER_STANDARD);
  process.env.EMAIL_FROM = "";
  assert.equal(absender(), ABSENDER_STANDARD);
});

test("Fußzeile nennt die Adresse und verspricht keine Antwort auf die Nachricht", () => {
  const html = wrapEmail("Titel", "<p>Inhalt</p>");
  assert.ok(html.includes('href="mailto:o.tas@lider-berlin.de"'), "mailto-Link fehlt");
  assert.ok(html.includes(">o.tas@lider-berlin.de</a>"));
  assert.ok(!/Antworten Sie einfach/i.test(html), "alter Satz steht noch drin");
});

test("Jede Mail mit dem gemeinsamen Rahmen trägt die Adresse", () => {
  const { html } = welcomeEmail("kunde@example.de", "pw12345678", null);
  assert.ok(html.includes("o.tas@lider-berlin.de"));
});

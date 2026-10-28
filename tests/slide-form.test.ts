import { test } from "node:test";
import assert from "node:assert/strict";
import { KONTAKT_LINK, slideAusFormular, slideLink, slideSchema, slideZeile } from "@/lib/slide-form";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

function formular(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

test("Bildpfad muss im Ordner des Ziels liegen", () => {
  const banner = slideSchema("kategorien-banner");
  const start = slideSchema("startseite");
  const daten = formular({ image_path: `startseite/${UUID}.jpg` });
  assert.equal(start.safeParse(slideAusFormular(daten)).success, true);
  assert.equal(banner.safeParse(slideAusFormular(daten)).success, false);
  const gruppe = formular({ image_path: `kategorien-banner/${UUID}.webp` });
  assert.equal(banner.safeParse(slideAusFormular(gruppe)).success, true);
});

test("Nur das Bild ist Pflicht, der Rest bleibt leer", () => {
  const schema = slideSchema("kategorien-banner");
  const r = schema.safeParse(
    slideAusFormular(formular({ image_path: `kategorien-banner/${UUID}.png`, is_active: "on" })),
  );
  assert.ok(r.success);
  const zeile = slideZeile(r.data);
  assert.equal(zeile.title, null);
  assert.equal(zeile.link_url, null);
  assert.equal(zeile.cta_label, null);
  assert.equal(zeile.valid_from, null);
  assert.equal(zeile.valid_until, null);
  assert.equal(zeile.is_active, true);
});

test("Knopftext ohne Link fällt weg", () => {
  const schema = slideSchema("startseite");
  const r = schema.safeParse(
    slideAusFormular(formular({ image_path: `startseite/${UUID}.jpg`, cta_label: "Zu den Angeboten" })),
  );
  assert.ok(r.success);
  assert.equal(slideZeile(r.data).cta_label, null);
});

test("Link: eigener Pfad oder https, sonst abgewiesen", () => {
  const schema = slideSchema("startseite");
  const mit = (link: string) =>
    schema.safeParse(slideAusFormular(formular({ image_path: `startseite/${UUID}.jpg`, link_url: link })))
      .success;
  assert.equal(mit("/shop/reduziert"), true);
  assert.equal(mit("https://example.com"), true);
  assert.equal(mit("//evil.example"), false);
  assert.equal(mit("javascript:alert(1)"), false);
});

test("Laufzeit: „bis“ gilt bis zum Ende des Tages in Berlin", () => {
  const schema = slideSchema("startseite");
  const r = schema.safeParse(
    slideAusFormular(
      formular({
        image_path: `startseite/${UUID}.jpg`,
        valid_from: "2026-10-01",
        valid_until: "2026-10-31",
      }),
    ),
  );
  assert.ok(r.success);
  const zeile = slideZeile(r.data);
  // 1.10. 00:00 Berlin (MESZ, +02:00)
  assert.equal(new Date(zeile.valid_from!).toISOString(), "2026-09-30T22:00:00.000Z");
  // 1.11. 00:00 Berlin (MEZ, +01:00): Sommerzeit endet am 25.10.
  assert.equal(new Date(zeile.valid_until!).toISOString(), "2026-10-31T23:00:00.000Z");
});

test("„Bis“ vor „Ab“ wird abgewiesen", () => {
  const schema = slideSchema("startseite");
  const r = schema.safeParse(
    slideAusFormular(
      formular({
        image_path: `startseite/${UUID}.jpg`,
        valid_from: "2026-10-10",
        valid_until: "2026-10-01",
      }),
    ),
  );
  assert.equal(r.success, false);
});

test("@kontakt wird zur neuen Mail an die Firmenadresse", () => {
  assert.equal(
    slideLink(KONTAKT_LINK, "info@lider.example", "Weblösungen"),
    "mailto:info@lider.example?subject=Anfrage%3A%20Webl%C3%B6sungen",
  );
  assert.equal(slideLink(KONTAKT_LINK, "info@lider.example", null), "mailto:info@lider.example?subject=Anfrage");
});

test("Ohne Firmenadresse entfällt der Mail-Link, andere Links bleiben", () => {
  assert.equal(slideLink(KONTAKT_LINK, null, "x"), null);
  assert.equal(slideLink(KONTAKT_LINK, "a b@c.de", "x"), null);
  assert.equal(slideLink("/shop/reduziert", null), "/shop/reduziert");
  assert.equal(slideLink(null, "info@lider.example"), null);
});

test("@kontakt und mailto: sind als Link erlaubt", () => {
  const schema = slideSchema("startseite");
  const mit = (link: string) =>
    schema.safeParse(slideAusFormular(formular({ image_path: `startseite/${UUID}.jpg`, link_url: link }))).success;
  assert.equal(mit("@kontakt"), true);
  assert.equal(mit("mailto:info@lider.example"), true);
  assert.equal(mit("mailto:"), false);
});

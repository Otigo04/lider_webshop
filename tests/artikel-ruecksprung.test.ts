import { test } from "node:test";
import assert from "node:assert/strict";
import { sichereListenAdresse } from "@/lib/artikel-ruecksprung";

test("Die Liste samt Suche ist ein gültiges Ziel", () => {
  assert.equal(sichereListenAdresse("/admin/products"), "/admin/products");
  assert.equal(
    sichereListenAdresse("/admin/products?q=ball&sort=kategorie"),
    "/admin/products?q=ball&sort=kategorie",
  );
});

test("Alles andere fällt auf die Liste zurück", () => {
  for (const fremd of [
    "https://boese.example/admin/products",
    "//boese.example",
    "/admin/products/123/edit",
    "/admin/productsx",
    "/kasse",
    "",
    null,
    42,
  ]) {
    assert.equal(sichereListenAdresse(fremd), "/admin/products");
  }
});

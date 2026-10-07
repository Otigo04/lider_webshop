import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  newToken,
} from "@/lib/verification-crypto";

test("Passwort übersteht Ver- und Entschlüsselung", () => {
  const enc = encryptSecret("Abc123xyz", "geheim");
  assert.notEqual(enc, "Abc123xyz");
  assert.equal(decryptSecret(enc, "geheim"), "Abc123xyz");
});

test("falscher Schlüssel oder veränderter Text wird abgewiesen", () => {
  const enc = encryptSecret("Abc123xyz", "geheim");
  assert.throws(() => decryptSecret(enc, "anders"));
  const [iv, tag, data] = enc.split(".");
  assert.throws(() => decryptSecret([iv, tag, data.slice(0, -2) + "AA"].join("."), "geheim"));
});

test("zweimal verschlüsselt ergibt unterschiedlichen Text", () => {
  assert.notEqual(encryptSecret("x", "k"), encryptSecret("x", "k"));
});

test("Token sind einmalig, Hash ist stabil", () => {
  const a = newToken();
  assert.notEqual(a, newToken());
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
});

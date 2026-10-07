import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Gültigkeit des Bestätigungslinks. */
export const VERIFICATION_TTL_HOURS = 48;

/** Zufälliges Token für den Link (256 Bit, URL-sicher). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** In der Datenbank steht nur der Hash – ein Datenbankleck liefert keine gültigen Links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function key(secret: string): Buffer {
  return createHash("sha256").update(`email-verification:${secret}`).digest();
}

/** AES-256-GCM, Ergebnis `iv.tag.daten` (base64url). */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** Wirft bei falschem Schlüssel oder verändertem Text. */
export function decryptSecret(enc: string, secret: string): string {
  const [iv, tag, data] = enc.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("Ungültiges Format");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

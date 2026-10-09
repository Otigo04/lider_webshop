import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Abmeldelink ohne Login: die Kennung des Kunden plus eine Signatur, die nur
 * wir erzeugen können (HMAC, Schlüssel aus SUPABASE_SERVICE_KEY). Ohne
 * Signatur lässt sich mit einer erratenen Kennung niemand abmelden. Der Link
 * läuft nie ab – wer eine alte Mail anklickt, soll sich auch dann noch
 * abmelden können.
 */

function signatur(userId: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_KEY ?? "")
    .update(`newsletter-abmelden:${userId}`)
    .digest("base64url");
}

export function abmeldeToken(userId: string): string {
  return signatur(userId);
}

export function abmeldeTokenGueltig(userId: string, token: string): boolean {
  const soll = Buffer.from(signatur(userId));
  const ist = Buffer.from(token);
  return soll.length === ist.length && timingSafeEqual(soll, ist);
}

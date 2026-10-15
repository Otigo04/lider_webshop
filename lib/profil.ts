/**
 * Pflichtangaben eines Kundenprofils – dieselben, die die Selbstregistrierung
 * verlangt (lib/actions/auth.ts): Ansprechpartner, Firma und Rechnungsanschrift.
 * Die Anschrift steht später auf jeder Rechnung; ohne sie erzeugte die erste
 * Bestellung eine Rechnung ohne Empfänger.
 *
 * Reine Funktion ohne Server-Importe: Kundenakte, Checkout und Bestell-Action
 * fragen dieselbe Stelle.
 *
 * Die USt-IdNr. oder Steuernummer steht seit Migration 073 ebenfalls auf der
 * Liste (Format: `lib/steuernummer.ts`).
 */

import { pruefeSteuernummer } from "@/lib/steuernummer";

export interface ProfilFelder {
  full_name?: string | null;
  company_name?: string | null;
  billing_street?: string | null;
  billing_zip?: string | null;
  billing_city?: string | null;
  vat_id?: string | null;
}

const PFLICHT: [keyof ProfilFelder, string][] = [
  ["full_name", "Ansprechpartner"],
  ["company_name", "Firma"],
  ["billing_street", "Straße und Hausnummer"],
  ["billing_zip", "PLZ"],
  ["billing_city", "Ort"],
];

/** Bezeichnungen der fehlenden Pflichtangaben; leer = Profil vollständig. */
export function profilLuecken(profil: ProfilFelder): string[] {
  const luecken = PFLICHT.filter(([feld]) => !profil[feld]?.trim()).map(
    ([, name]) => name,
  );
  // USt-IdNr. oder Steuernummer: Pflicht und im Format gültig. Ein Wert, den
  // das Konto-Formular nie angenommen hätte (Altbestand), gilt als fehlend.
  if (!pruefeSteuernummer(profil.vat_id ?? "").ok) {
    luecken.push("USt-IdNr. / Steuernummer");
  }
  return luecken;
}

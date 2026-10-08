import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { findProductsByCodes } from "@/lib/queries/pos";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";
import { getCompanySettings } from "@/lib/queries/settings";
import { findGebuchteRechnung } from "@/lib/queries/stock";
import { leseRechnung } from "@/lib/rechnung-lesen";
import type { RechnungAntwort } from "@/lib/rechnung-import";

/**
 * Rechnung lesen – Upload, KI, Abgleich. Bucht nichts.
 *
 * Route Handler statt Server Action: eine Server Action nimmt nur 1 MB
 * Body an, ein PDF mit Logo und Kleingedrucktem ist größer. Die Grenze hier
 * ist die von Vercel für Anfragen (4,5 MB), mit etwas Luft.
 *
 * Der Abgleich läuft gleich hier, in einer Abfrage, damit der Dialog nur eine
 * Antwort abwarten muss. Gebucht wird danach vom Dialog über
 * `recordStockEntries()` – ein einziger Buchungsweg.
 */

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;

function fehler(text: string, status: number) {
  return NextResponse.json({ error: text }, { status });
}

export async function POST(request: Request) {
  await requireAdmin();

  let datei: FormDataEntryValue | null;
  try {
    datei = (await request.formData()).get("datei");
  } catch {
    return fehler("Die Datei konnte nicht gelesen werden.", 400);
  }

  if (!(datei instanceof File)) return fehler("Bitte eine PDF-Datei wählen.", 400);
  if (datei.size > MAX_BYTES) {
    return fehler("Die Datei ist größer als 4 MB. Bitte verkleinern.", 413);
  }

  const bytes = new Uint8Array(await datei.arrayBuffer());
  // Dateiendung und Typ kommen vom Browser – maßgeblich ist der Dateikopf.
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    return fehler("Das ist keine PDF-Datei.", 400);
  }

  const kategorien = await getCategories();

  let rechnung;
  try {
    rechnung = await leseRechnung(
      bytes,
      kategorien.map((k) => ({ id: k.id, name: k.name })),
    );
  } catch (ursache) {
    console.error("[wareneingang] Rechnung lesen:", ursache);
    return fehler(
      "Die Rechnung konnte nicht gelesen werden. Bitte noch einmal versuchen oder den Wareneingang von Hand erfassen.",
      502,
    );
  }

  if (rechnung.positionen.length === 0) {
    return fehler("Auf der Rechnung wurden keine Artikelzeilen gefunden.", 422);
  }

  const codes = rechnung.positionen
    .map((p) => p.ean)
    .filter((code): code is string => Boolean(code));

  const [gefunden, bereitsGebuchtAm, einstellungen, vorgabeKategorieId] =
    await Promise.all([
      findProductsByCodes(codes),
      findGebuchteRechnung(rechnung.rechnungsnummer),
      getCompanySettings(),
      getLastUsedCategoryId(),
    ]);

  const antwort: RechnungAntwort = {
    rechnung,
    produkte: Object.fromEntries(gefunden),
    bereitsGebuchtAm,
    mwstSatz: Number(einstellungen.pos_vat_rate),
    vorgabeKategorieId,
  };
  return NextResponse.json(antwort);
}

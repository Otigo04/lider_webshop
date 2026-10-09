import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { katalogAufbau } from "@/lib/katalog";
import {
  buildKatalogHinweisHtml,
  buildKatalogHtml,
} from "@/lib/katalog-bogen";
import { getLogoMarkPath, getLogoPath, getLogoWordmarkPath } from "@/lib/logo";
import { getKatalog, getKatalogArtikel } from "@/lib/queries/kataloge";
import { getCompanySettings } from "@/lib/queries/settings";

/**
 * Der Katalog als A4-Dokument.
 *
 * Route Handler statt Seite, aus demselben Grund wie Kassenbon und
 * Preisschild-Bogen: als Seite läge er unter dem Verwaltungslayout und
 * brächte Reiterleiste und Rahmen mit aufs Papier.
 *
 * GET und nicht POST wie beim Preisschild: dort reist die ganze Schilderliste
 * im Formular mit, hier steht die Auswahl in der Datenbank – die Adresse
 * trägt nur die Kennung, und die Vorschau lässt sich neu laden.
 *
 * `?druck=0` unterdrückt den Druckdialog (Vorschau), wie beim Kassenbon.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;

  const katalog = await getKatalog(id);
  if (!katalog) {
    return new NextResponse("Diesen Katalog gibt es nicht.", { status: 404 });
  }

  const [artikel, firma] = await Promise.all([
    getKatalogArtikel(katalog.productIds),
    getCompanySettings(),
  ]);

  const e = katalog.einstellungen;
  const aufbau = katalogAufbau(artikel, e, new Set(katalog.baldIds));
  const kopf = {
    "Content-Type": "text/html; charset=utf-8",
    // Preise und Fotoadressen gelten für diesen Aufruf – nie aus dem Cache.
    "Cache-Control": "no-store",
  };

  if (aufbau.seiten.length === 0) {
    const gruende: string[] = [];
    if (artikel.length === 0) gruende.push("Es sind noch keine Artikel ausgewählt.");
    if (aufbau.ohneFoto.length > 0) {
      gruende.push(`${aufbau.ohneFoto.length} Artikel haben kein Foto.`);
    }
    if (aufbau.ohnePreis.length > 0) {
      gruende.push(
        `${aufbau.ohnePreis.length} Artikel haben keinen Preis in der gewählten Preisart.`,
      );
    }
    return new NextResponse(buildKatalogHinweisHtml(e.title, gruende), {
      headers: kopf,
    });
  }

  const html = buildKatalogHtml(
    aufbau,
    e,
    {
      name: firma.company_name,
      strasse: firma.address_street,
      plzOrt:
        [firma.address_zip, firma.address_city].filter(Boolean).join(" ") || null,
      telefon: firma.phone,
      email: firma.email,
      website: firma.website,
      ladenpreiseBrutto: firma.pos_prices_gross,
    },
    {
      logo: getLogoPath(),
      wappen: getLogoMarkPath(),
      wortmarke: getLogoWordmarkPath(),
      stand: new Date(),
      autoPrint: new URL(request.url).searchParams.get("druck") !== "0",
    },
  );

  return new NextResponse(html, { headers: kopf });
}

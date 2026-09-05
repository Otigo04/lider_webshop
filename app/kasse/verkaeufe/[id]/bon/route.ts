import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPosSale } from "@/lib/queries/pos";
import { getCompanySettings } from "@/lib/queries/settings";
import { buildReceiptHtml, istBonbreite } from "@/lib/pos-receipt";

/**
 * Druckbon zu einem Kassenverkauf.
 *
 * Route Handler statt Seite: der Bon soll ohne Kopfleiste, Reiter und Fußzeile
 * im eigenen Fenster stehen und sofort den Druckdialog öffnen. Als Seite läge
 * er unter dem Kassenlayout und brächte dessen Rahmen mit aufs Papier.
 *
 * Rollenbreite über ?breite=58 für schmale Rollen; ?druck=0 unterdrückt den
 * Druckdialog, wenn man den Bon nur ansehen will.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/kasse/verkaeufe/[id]/bon">,
) {
  await requireAdmin();

  const { id } = await params;
  const sale = await getPosSale(id);

  if (!sale) {
    return new NextResponse("Verkauf nicht gefunden.", { status: 404 });
  }

  const url = new URL(request.url);
  const breite = Number(url.searchParams.get("breite"));
  const company = await getCompanySettings();

  const html = buildReceiptHtml(sale, sale.items ?? [], company, {
    breite: istBonbreite(breite) ? breite : 80,
    autoPrint: url.searchParams.get("druck") !== "0",
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Ein Bon wird einmal gedruckt und nie aus dem Cache geholt.
      "Cache-Control": "no-store",
    },
  });
}

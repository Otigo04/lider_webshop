import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAbschluss } from "@/lib/queries/kasse";
import { getCompanySettings } from "@/lib/queries/settings";
import { buildZBonHtml, istBonbreite } from "@/lib/pos-receipt";

/**
 * Z-Bon eines Kassentags – dasselbe Papier wie der Kassenbon, deshalb
 * ebenfalls ein Route Handler ohne Layout (siehe
 * app/kasse/verkaeufe/[id]/bon/route.ts).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/kasse/tagesabschluss/[datum]/bon">,
) {
  await requireAdmin();

  const { datum } = await params;

  // Der Kassentag kommt aus der URL: bevor er in eine Abfrage geht, muss die
  // Form stimmen.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    return new NextResponse("Ungültiges Datum.", { status: 400 });
  }

  const abschluss = await getAbschluss(datum);
  if (!abschluss) {
    return new NextResponse(
      "Für diesen Tag gibt es keinen Abschluss.",
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const breite = Number(url.searchParams.get("breite"));
  const company = await getCompanySettings();

  const html = buildZBonHtml(abschluss, company, {
    breite: istBonbreite(breite) ? breite : 80,
    autoPrint: url.searchParams.get("druck") !== "0",
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

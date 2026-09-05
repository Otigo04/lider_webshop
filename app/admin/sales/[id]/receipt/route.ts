import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPosReceiptUrl } from "@/lib/actions/pos";

/**
 * Beleg-Download als einfacher Link statt als Schaltfläche mit JavaScript.
 *
 * Die Datei liegt in einem privaten Bucket und ist nur über eine kurzlebige
 * signierte URL erreichbar. Die hier zu erzeugen und weiterzuleiten, spart
 * der Liste jede Client-Logik: aus Sicht des Browsers ist es ein Link.
 *
 * Fehlt das PDF noch (etwa weil die Erzeugung beim Verkauf scheiterte), wird
 * es hier nachgeholt.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/sales/[id]/receipt">,
) {
  await requireAdmin();

  const { id } = await params;
  const url = await getPosReceiptUrl(id);

  if (!url) {
    return new NextResponse("Beleg nicht verfügbar.", { status: 404 });
  }
  return NextResponse.redirect(url);
}

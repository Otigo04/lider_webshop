import { NextResponse } from "next/server";
import { PRODUCT_BUCKET } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bilder für den Newsletter: leitet auf eine frisch signierte Adresse weiter.
 *
 * Die Fotos liegen in einem privaten Bucket, und eine signierte Adresse, die
 * in einer Mail steht, wäre nach Stunden tot – Mails werden Wochen später
 * wieder geöffnet. Diese Adresse bleibt gültig und signiert bei jedem Abruf neu.
 *
 * Zwei Arten, beide eng begrenzt: `?produkt=<id>` (erstes Foto eines aktiven
 * Artikels – dieselben Fotos zeigt der Shop auch ohne Anmeldung) und
 * `?p=newsletter/<datei>` (im Editor hochgeladene Bilder; nur dieser Ordner,
 * kein Pfad nach außen).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = createAdminClient();

  let pfad: string | null = null;
  const produkt = url.searchParams.get("produkt");
  const direkt = url.searchParams.get("p");

  if (produkt && /^[0-9a-f-]{36}$/i.test(produkt)) {
    const { data } = await db
      .from("products")
      .select("is_active, images:product_images (file_path, display_order)")
      .eq("id", produkt)
      .maybeSingle();
    if (data?.is_active) {
      const bilder = [...((data.images ?? []) as { file_path: string; display_order: number }[])].sort(
        (a, b) => a.display_order - b.display_order,
      );
      pfad = bilder[0]?.file_path ?? null;
    }
  } else if (direkt && /^newsletter\/[A-Za-z0-9._-]+$/.test(direkt) && !direkt.includes("..")) {
    pfad = direkt;
  }

  if (!pfad) return new NextResponse("Nicht gefunden.", { status: 404 });

  const { data: signiert } = await db.storage.from(PRODUCT_BUCKET).createSignedUrl(pfad, 3600);
  if (!signiert) return new NextResponse("Nicht gefunden.", { status: 404 });

  return NextResponse.redirect(signiert.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "public, max-age=600" },
  });
}

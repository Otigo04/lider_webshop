import { NextResponse } from "next/server";
import { meldeNewsletterAb } from "@/lib/newsletter-abo";

/**
 * Ein-Klick-Abmeldung der Mailprogramme (List-Unsubscribe-Post, RFC 8058): die
 * Mailanwendung schickt selbst ein POST an diese Adresse. GET tut bewusst
 * nichts – Mail-Scanner rufen Links vorab ab, und die würden sonst alle
 * abmelden.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const ok = await meldeNewsletterAb(
    url.searchParams.get("u") ?? "",
    url.searchParams.get("t") ?? "",
  );
  return new NextResponse(ok ? "Abgemeldet." : "Ungültiger Link.", { status: ok ? 200 : 400 });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dokumentSchema } from "@/lib/newsletter";
import { ABMELDE_PLATZHALTER, baueNewsletterHtml, ladeNewsletterInhalt } from "@/lib/newsletter-mail";
import { getCompanySettings } from "@/lib/queries/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Vorschau eines Newsletters: dasselbe HTML, das später verschickt wird. Ein
 * schon verschickter Newsletter zeigt den festgehaltenen Stand (`sent_html`),
 * nicht den heutigen Artikelbestand.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const kopf = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("newsletters")
    .select("subject, preheader, blocks, sent_html")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new NextResponse("Nicht gefunden.", { status: 404 });

  if (data.sent_html) {
    return new NextResponse((data.sent_html as string).replaceAll(ABMELDE_PLATZHALTER, "#"), { headers: kopf });
  }

  const dok = dokumentSchema.safeParse({
    betreff: data.subject,
    vorschautext: data.preheader ?? "",
    blocks: data.blocks,
  });
  if (!dok.success) {
    return new NextResponse(`<p style="font-family:sans-serif;padding:16px">${dok.error.issues[0].message}</p>`, { headers: kopf });
  }

  const [firma, inhalt] = await Promise.all([
    getCompanySettings(),
    ladeNewsletterInhalt(supabase, dok.data.blocks),
  ]);
  return new NextResponse(
    baueNewsletterHtml({ dokument: dok.data, inhalt, firma, abmeldeUrl: "#" }),
    { headers: kopf },
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewsletterEditor } from "@/components/admin/newsletter-editor";
import { getAbonnenten, getKundenAuswahl, getNewsletter, getProduktAuswahl } from "@/lib/queries/newsletter";

export const metadata: Metadata = { title: "Newsletter bearbeiten" };

// Der Versand läuft in der Action dieser Seite; eine Function darf 300 s dauern.
export const maxDuration = 300;

export default async function NewsletterEditorPage({
  params,
}: PageProps<"/admin/newsletter/[id]">) {
  const { id } = await params;
  const [newsletter, produkte, abo, kunden] = await Promise.all([
    getNewsletter(id),
    getProduktAuswahl(),
    getAbonnenten(),
    getKundenAuswahl(),
  ]);
  if (!newsletter) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/admin/newsletter"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Alle Newsletter
      </Link>
      <NewsletterEditor
        id={newsletter.id}
        status={newsletter.status}
        start={newsletter.dokument}
        produkte={produkte}
        kunden={kunden}
        abonnenten={abo.abonnenten.length}
        versand={{
          gesendet: newsletter.gesendet,
          fehlgeschlagen: newsletter.fehlgeschlagen,
          offen: newsletter.offen,
        }}
      />
    </div>
  );
}

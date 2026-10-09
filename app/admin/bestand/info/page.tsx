import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ArtikelInfo } from "@/components/admin/artikel-info";

export const metadata: Metadata = { title: "Artikelauskunft" };

/**
 * Artikelauskunft: Etikett unter den Scanner, der Artikel steht da.
 *
 * Unter Bestand und nicht als eigener Reiter – die Leiste ist voll, und wer
 * im Lager steht, kommt ohnehin von dort. Das Scannerfeld hat von Anfang an
 * den Fokus, ein Scanner, der Enter sendet, braucht keinen Mausklick.
 */
export default function ArtikelauskunftPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/admin/bestand"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Bestand
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Artikelauskunft</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Artikel scannen – es wird nichts gebucht, nur angezeigt, welcher
          Artikel gemeint ist und wie viel davon da ist.
        </p>
      </div>
      <ArtikelInfo />
    </div>
  );
}

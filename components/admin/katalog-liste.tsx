"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { deleteKatalog, duplicateKatalog } from "@/lib/actions/kataloge";
import { formatDate } from "@/lib/format";
import { LAYOUT_NAMEN, STIL_NAMEN } from "@/lib/katalog";
import type { KatalogZeile } from "@/lib/queries/kataloge";

const PREISART_KURZ = {
  grosshandel: "Großhandel",
  laden: "Ladenpreis",
  ohne: "ohne Preise",
} as const;

/** Tabelle der gespeicherten Kataloge. */
export function KatalogListe({ kataloge }: { kataloge: KatalogZeile[] }) {
  const router = useRouter();
  const [laeuft, startTransition] = useTransition();

  function kopiere(id: string) {
    startTransition(async () => {
      const ergebnis = await duplicateKatalog(id);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success(ergebnis.success ?? "Kopie angelegt.");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Katalog</th>
            <th className="py-2 pr-3 font-medium">Aufmachung</th>
            <th className="py-2 pr-3 text-right font-medium">Artikel</th>
            <th className="py-2 pr-3 font-medium">Geändert</th>
            <th className="py-2 text-right font-medium">
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {kataloge.map((katalog) => (
            <tr
              key={katalog.id}
              className="border-b border-border last:border-0 hover:bg-muted/50"
            >
              <td className="py-2.5 pr-3">
                <Link
                  href={`/admin/kataloge/${katalog.id}`}
                  className="font-medium hover:underline"
                >
                  {katalog.title}
                </Link>
                {katalog.subtitle ? (
                  <span className="block text-xs text-muted-foreground">
                    {katalog.subtitle}
                  </span>
                ) : null}
              </td>
              <td className="py-2.5 pr-3 text-muted-foreground">
                {LAYOUT_NAMEN[katalog.layout]} · {STIL_NAMEN[katalog.stil]} ·{" "}
                {PREISART_KURZ[katalog.preisart]}
              </td>
              <td className="py-2.5 pr-3 text-right tabular">
                {katalog.artikel}
              </td>
              <td className="py-2.5 pr-3 tabular text-muted-foreground">
                {formatDate(katalog.updatedAt)}
              </td>
              <td className="py-2.5">
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <a
                      href={`/admin/kataloge/${katalog.id}/druck?druck=0`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Printer aria-hidden /> Ansehen
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={laeuft}
                    onClick={() => kopiere(katalog.id)}
                  >
                    <Copy aria-hidden /> Kopie
                  </Button>
                  <ConfirmAction
                    action={deleteKatalog}
                    fields={{ id: katalog.id }}
                    title="Katalog löschen?"
                    description={`„${katalog.title}“ wird mit seiner Zusammenstellung gelöscht. Die Artikel selbst bleiben unverändert.`}
                    confirmLabel="Löschen"
                    destructive
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${katalog.title} löschen`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

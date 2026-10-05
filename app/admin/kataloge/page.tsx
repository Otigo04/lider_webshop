import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import { KatalogListe } from "@/components/admin/katalog-liste";
import { Button } from "@/components/ui/button";
import { createKatalog } from "@/lib/actions/kataloge";
import { getKataloge } from "@/lib/queries/kataloge";

export const metadata: Metadata = { title: "Kataloge" };

/**
 * Kataloge (Migration 051).
 *
 * Ein Katalog ist eine gespeicherte Zusammenstellung: welche Artikel, in
 * welcher Reihenfolge, in welchem Raster. Preise, Bezeichnungen und Fotos
 * stehen nicht darin – die kommen bei jeder Ausgabe frisch aus dem
 * Artikelstamm. Dieselbe Zusammenstellung ergibt deshalb nächsten Monat den
 * Katalog mit den Preisen von nächstem Monat.
 */
export default async function KatalogePage({
  searchParams,
}: PageProps<"/admin/kataloge">) {
  const [kataloge, params] = await Promise.all([getKataloge(), searchParams]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kataloge</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Artikel zu einem Katalog zusammenstellen – vom Gesamtsortiment bis
            zum Aktionsheft – und als A4-Dokument drucken oder als PDF
            verschicken. Gespeichert wird die Auswahl; Preise und Fotos kommen
            bei jeder Ausgabe aus dem Artikelstamm.
          </p>
        </div>

        {kataloge !== null ? (
          <form action={createKatalog}>
            <Button type="submit">
              <Plus className="size-4" aria-hidden /> Neuer Katalog
            </Button>
          </form>
        ) : null}
      </div>

      {params.fehler === "anlegen" ? (
        <p className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Der Katalog konnte nicht angelegt werden.
        </p>
      ) : null}

      {kataloge === null ? (
        <p className="mt-8 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
          Die Tabellen für Kataloge fehlen noch. Bitte{" "}
          <code className="font-mono text-xs">
            supabase/migrations/051_kataloge.sql
          </code>{" "}
          einspielen.
        </p>
      ) : kataloge.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <BookOpen
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Noch kein Katalog. Legen Sie einen an, wählen Sie Warengruppen oder
            einzelne Artikel aus und drucken Sie ihn – die Zusammenstellung
            bleibt für die nächste Ausgabe erhalten.
          </p>
        </div>
      ) : (
        <KatalogListe kataloge={kataloge} />
      )}
    </div>
  );
}

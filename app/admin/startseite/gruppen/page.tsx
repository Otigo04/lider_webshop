import type { Metadata } from "next";
import Link from "next/link";
import { SlideVerwaltung, zustand } from "@/components/admin/slide-verwaltung";
import { deleteBanner, toggleBanner } from "@/lib/actions/category-banners";
import { requireAdmin } from "@/lib/auth";
import { getAllCategoryBanners } from "@/lib/queries/category-banners";
import { getCategories } from "@/lib/queries/products";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Banner der Warengruppen" };

export default async function AdminGruppenBannerPage({
  searchParams,
}: PageProps<"/admin/startseite/gruppen">) {
  await requireAdmin();
  const params = await searchParams;
  const slug = typeof params.gruppe === "string" ? params.gruppe : null;
  const editId = typeof params.edit === "string" ? params.edit : null;

  const [kategorien, banner] = await Promise.all([getCategories(), getAllCategoryBanners()]);
  const gewaehlt = kategorien.find((k) => k.slug === slug) ?? null;
  // Datum einmal pro Anfrage – Server Component, rendert nicht erneut.
  // eslint-disable-next-line react-hooks/purity
  const jetzt = Date.now();

  const zaehlung = new Map<string, { gesamt: number; laeuft: number }>();
  for (const b of banner) {
    const z = zaehlung.get(b.category_id) ?? { gesamt: 0, laeuft: 0 };
    z.gesamt += 1;
    if (zustand(b, jetzt).text === "läuft" && b.imageUrl) z.laeuft += 1;
    zaehlung.set(b.category_id, z);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Banner der Warengruppen</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Bild ganz oben auf der Seite einer Warengruppe. Warengruppen ohne Banner
        zeigen oben nichts. Mehrere laufende Banner wechseln automatisch.
      </p>

      <nav aria-label="Warengruppe wählen" className="mt-6">
        <h3 className="text-sm font-medium text-muted-foreground">Warengruppe</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {kategorien.map((k) => {
            const z = zaehlung.get(k.id);
            const aktiv = k.id === gewaehlt?.id;
            return (
              <li key={k.id}>
                <Link
                  href={`/admin/startseite/gruppen?gruppe=${k.slug}`}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    aktiv
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {k.name}
                  {z ? (
                    <span
                      className={cn(
                        "rounded px-1.5 text-xs font-medium",
                        aktiv
                          ? "bg-white/20"
                          : z.laeuft > 0
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground",
                      )}
                      title={z.laeuft > 0 ? `${z.laeuft} laufen` : "keins läuft gerade"}
                    >
                      {z.laeuft > 0 ? z.laeuft : z.gesamt}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Grüne Zahl: so viele Banner laufen gerade. Graue Zahl: angelegt, aber
          ausgeblendet, abgelaufen oder geplant.
        </p>
      </nav>

      {gewaehlt ? (
        <div className="mt-8 border-t border-border pt-2">
          <h3 className="mt-4 text-base font-semibold">{gewaehlt.name}</h3>
          <SlideVerwaltung
            slides={banner.filter((b) => b.category_id === gewaehlt.id)}
            editId={editId}
            ziel={{ art: "gruppe", categoryId: gewaehlt.id, slug: gewaehlt.slug }}
            basis={`/admin/startseite/gruppen?gruppe=${gewaehlt.slug}`}
            toggleAktion={toggleBanner}
            deleteAktion={deleteBanner}
            texte={{
              einzahl: "Banner",
              mehrzahl: "Banner",
              leer: "Kein Banner aktiv – die Seite der Warengruppe beginnt ohne Bild.",
              ort: "der Seite der Warengruppe",
              neu: "Neues Banner",
              bearbeiten: "Banner bearbeiten",
            }}
          />
        </div>
      ) : (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Oben eine Warengruppe wählen, um ihre Banner zu pflegen.
        </p>
      )}
    </div>
  );
}

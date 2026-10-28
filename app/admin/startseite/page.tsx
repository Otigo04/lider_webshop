import type { Metadata } from "next";
import { SlideVerwaltung } from "@/components/admin/slide-verwaltung";
import { deleteSlide, toggleSlide } from "@/lib/actions/home-slides";
import { requireAdmin } from "@/lib/auth";
import { getAllSlides } from "@/lib/queries/slides";

export const metadata: Metadata = { title: "Startseite" };

export default async function AdminStartseitePage({
  searchParams,
}: PageProps<"/admin/startseite">) {
  await requireAdmin();
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;
  const slides = await getAllSlides();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Werbebilder Startseite</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Werbebilder ganz oben auf der Startseite. Mehrere laufende Bilder
        wechseln automatisch, in der Reihenfolge dieser Liste.
      </p>

      <SlideVerwaltung
        slides={slides}
        editId={editId}
        ziel={{ art: "start" }}
        basis="/admin/startseite"
        toggleAktion={toggleSlide}
        deleteAktion={deleteSlide}
        texte={{
          einzahl: "Werbebild",
          mehrzahl: "Werbebilder",
          leer: "Kein Werbebild aktiv – die Startseite beginnt mit dem Kopfbereich.",
          ort: "der Startseite",
          neu: "Neues Werbebild",
          bearbeiten: "Werbebild bearbeiten",
        }}
      />
    </div>
  );
}

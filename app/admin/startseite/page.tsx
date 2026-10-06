import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { SlideMoveButtons } from "@/components/admin/slide-move-buttons";
import { SlideEditor } from "@/components/admin/slide-editor";
import { HomeSlider } from "@/components/home-slider";
import { Button } from "@/components/ui/button";
import { deleteSlide, toggleSlide } from "@/lib/actions/home-slides";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getAllSlides, type SlideMitBild } from "@/lib/queries/slides";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Startseite" };

function zustand(s: SlideMitBild, jetzt: number): { text: string; stil: string } {
  if (!s.is_active) return { text: "ausgeblendet", stil: "border-border bg-muted text-muted-foreground" };
  if (s.valid_until && new Date(s.valid_until).getTime() <= jetzt) {
    return { text: "abgelaufen", stil: "border-border bg-muted text-muted-foreground" };
  }
  if (s.valid_from && new Date(s.valid_from).getTime() > jetzt) {
    return { text: `ab ${formatDate(s.valid_from)}`, stil: "border-brand/30 bg-brand-soft text-brand" };
  }
  return { text: "läuft", stil: "border-success/30 bg-success/10 text-success" };
}

export default async function AdminStartseitePage({
  searchParams,
}: PageProps<"/admin/startseite">) {
  await requireAdmin();
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;

  const slides = await getAllSlides();
  const editing = slides.find((s) => s.id === editId);
  // Datum einmal pro Anfrage – Server Component, rendert nicht erneut.
  // eslint-disable-next-line react-hooks/purity
  const jetzt = Date.now();
  const laufend = slides.filter((s) => zustand(s, jetzt).text === "läuft" && s.imageUrl);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Startseite</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Werbebilder ganz oben auf der Startseite. Mehrere laufende Bilder
        wechseln automatisch, in der Reihenfolge dieser Liste.
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          So sieht es gerade aus ({laufend.length} {laufend.length === 1 ? "Bild" : "Bilder"})
        </h2>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          {laufend.length > 0 ? (
            <HomeSlider
              slides={laufend.map((s) => ({
                id: s.id,
                title: s.title,
                subtitle: s.subtitle,
                ctaLabel: s.cta_label,
                href: s.link_url,
                imageUrl: s.imageUrl!,
                mobileImageUrl: s.mobileImageUrl,
                tone: s.tone,
              }))}
            />
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              Kein Werbebild aktiv – die Startseite beginnt mit dem Kopfbereich.
            </p>
          )}
        </div>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <h2 className="font-medium">Alle Werbebilder</h2>
          {slides.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              Noch keine Werbebilder. Rechts das erste anlegen.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-md border border-border">
              {slides.map((s, index) => {
                const z = zustand(s, jetzt);
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex flex-wrap items-center gap-4 p-3 sm:flex-nowrap",
                      s.id === editId && "bg-brand-soft/60",
                    )}
                  >
                    <SlideMoveButtons
                      id={s.id}
                      oben={index === 0}
                      unten={index === slides.length - 1}
                    />
                    <div className="relative aspect-[3/1] w-40 shrink-0 overflow-hidden rounded border border-border bg-muted">
                      {s.imageUrl ? (
                        <Image src={s.imageUrl} alt="" fill sizes="160px" className="object-cover" />
                      ) : (
                        <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground/40" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.title || <span className="text-muted-foreground">(nur Bild)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.link_url ? `→ ${s.link_url}` : "ohne Link"}
                        {s.valid_until
                          ? ` · bis ${formatDate(new Date(new Date(s.valid_until).getTime() - 1))}`
                          : ""}
                      </p>
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium",
                          z.stil,
                        )}
                      >
                        {z.text}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/startseite?edit=${s.id}`}>Bearbeiten</Link>
                      </Button>
                      <ConfirmAction
                        action={toggleSlide}
                        fields={{ id: s.id, is_active: String(!s.is_active) }}
                        title={s.is_active ? "Werbebild ausblenden?" : "Werbebild einblenden?"}
                        description={
                          s.is_active
                            ? "Das Bild verschwindet von der Startseite und bleibt hier gespeichert."
                            : "Das Bild erscheint wieder auf der Startseite (sofern die Laufzeit passt)."
                        }
                        confirmLabel={s.is_active ? "Ausblenden" : "Einblenden"}
                        trigger={
                          <Button variant="ghost" size="sm">
                            {s.is_active ? "Ausblenden" : "Einblenden"}
                          </Button>
                        }
                      />
                      <ConfirmAction
                        action={deleteSlide}
                        fields={{ id: s.id }}
                        title="Werbebild löschen?"
                        description="Bild und Text werden endgültig entfernt."
                        confirmLabel="Löschen"
                        destructive
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive">
                            Löschen
                          </Button>
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editing ? "Werbebild bearbeiten" : "Neues Werbebild"}</h2>
            {editing ? (
              <Link href="/admin/startseite" className="text-xs text-muted-foreground hover:text-foreground">
                Abbrechen
              </Link>
            ) : null}
          </div>
          <div className="mt-4">
            <SlideEditor
              key={editing?.id ?? "neu"}
              slide={editing}
              imageUrl={editing?.imageUrl}
              mobileImageUrl={editing?.mobileImageUrl}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

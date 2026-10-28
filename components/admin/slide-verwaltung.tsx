import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { SlideEditor, type SlideZiel } from "@/components/admin/slide-editor";
import { SlideMoveButtons } from "@/components/admin/slide-move-buttons";
import { HomeSlider } from "@/components/home-slider";
import { Button } from "@/components/ui/button";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { formatDate } from "@/lib/format";
import type { SlideMitBild } from "@/lib/queries/slides";
import { cn } from "@/lib/utils";

type ServerAktion = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;

export function zustand(s: SlideMitBild, jetzt: number): { text: string; stil: string } {
  if (!s.is_active) return { text: "ausgeblendet", stil: "border-border bg-muted text-muted-foreground" };
  if (s.valid_until && new Date(s.valid_until).getTime() <= jetzt) {
    return { text: "abgelaufen", stil: "border-border bg-muted text-muted-foreground" };
  }
  if (s.valid_from && new Date(s.valid_from).getTime() > jetzt) {
    return { text: `ab ${formatDate(s.valid_from)}`, stil: "border-brand/30 bg-brand-soft text-brand" };
  }
  return { text: "läuft", stil: "border-success/30 bg-success/10 text-success" };
}

/**
 * Vorschau, Liste und Editor für Bilder, die oben auf einer Seite laufen:
 * Werbebilder der Startseite und Banner einer Warengruppe (beide 3:1). Beide
 * Verwaltungen sehen gleich aus und bedienen sich gleich – nur Ziel, Aktionen
 * und Texte unterscheiden sich.
 */
export function SlideVerwaltung({
  slides,
  editId,
  ziel,
  basis,
  toggleAktion,
  deleteAktion,
  texte,
}: {
  slides: SlideMitBild[];
  editId: string | null;
  ziel: SlideZiel;
  /** Adresse der Seite; „?edit=<id>" und Abbrechen hängen daran */
  basis: string;
  toggleAktion: ServerAktion;
  deleteAktion: ServerAktion;
  texte: {
    einzahl: string;
    mehrzahl: string;
    /** „Kein … aktiv – …" */
    leer: string;
    ort: string;
    neu: string;
    bearbeiten: string;
  };
}) {
  const gruppe = ziel.art === "gruppe";
  const editing = slides.find((s) => s.id === editId);
  // Datum einmal pro Anfrage – Server Component, rendert nicht erneut.
  // eslint-disable-next-line react-hooks/purity
  const jetzt = Date.now();
  const laufend = slides.filter((s) => zustand(s, jetzt).text === "läuft" && s.imageUrl);
  const mitEdit = (id: string) => `${basis}${basis.includes("?") ? "&" : "?"}edit=${id}`;

  return (
    <>
      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground">
          So sieht es gerade aus ({laufend.length} {laufend.length === 1 ? texte.einzahl : texte.mehrzahl})
        </h2>
        <div className="mt-2 overflow-hidden rounded-md border border-border">
          {laufend.length > 0 ? (
            <HomeSlider
              format={gruppe ? "gruppe" : "start"}
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
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">{texte.leer}</p>
          )}
        </div>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <h2 className="font-medium">Alle {texte.mehrzahl}</h2>
          {slides.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              Noch keine {texte.mehrzahl}. Rechts das erste anlegen.
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
                      gruppe={gruppe}
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
                        <Link href={mitEdit(s.id)}>Bearbeiten</Link>
                      </Button>
                      <ConfirmAction
                        action={toggleAktion}
                        fields={{ id: s.id, is_active: String(!s.is_active) }}
                        title={s.is_active ? `${texte.einzahl} ausblenden?` : `${texte.einzahl} einblenden?`}
                        description={
                          s.is_active
                            ? `Das Bild verschwindet von ${texte.ort} und bleibt hier gespeichert.`
                            : `Das Bild erscheint wieder auf ${texte.ort} (sofern die Laufzeit passt).`
                        }
                        confirmLabel={s.is_active ? "Ausblenden" : "Einblenden"}
                        trigger={
                          <Button variant="ghost" size="sm">
                            {s.is_active ? "Ausblenden" : "Einblenden"}
                          </Button>
                        }
                      />
                      <ConfirmAction
                        action={deleteAktion}
                        fields={{ id: s.id }}
                        title={`${texte.einzahl} löschen?`}
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
            <h2 className="font-medium">{editing ? texte.bearbeiten : texte.neu}</h2>
            {editing ? (
              <Link href={basis} className="text-xs text-muted-foreground hover:text-foreground">
                Abbrechen
              </Link>
            ) : null}
          </div>
          <div className="mt-4">
            <SlideEditor
              key={editing?.id ?? "neu"}
              ziel={ziel}
              slide={editing}
              imageUrl={editing?.imageUrl}
              mobileImageUrl={editing?.mobileImageUrl}
            />
          </div>
        </aside>
      </div>
    </>
  );
}

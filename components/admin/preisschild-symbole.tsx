"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_BUCKET,
} from "@/lib/constants";
import { createLabelIcon, deleteLabelIcon } from "@/lib/actions/preisschilder";
import { createClient } from "@/lib/supabase/client";
import type { LabelIcon } from "@/lib/queries/preisschilder";

/**
 * Symbolbibliothek der Preisschilder.
 *
 * Einmal hochladen, danach anklicken: ein Markenzeichen wie das LEGO-Logo
 * kommt auf Dutzende Schilder, und es bei jedem Druck neu vom Rechner zu
 * suchen wäre der sichere Weg, es wegzulassen.
 *
 * Die Datei geht direkt aus dem Browser in den Storage, wie beim
 * Kategoriebild (components/admin/category-image.tsx) – die Server Action
 * bekommt nur den Pfad.
 */
export function PreisschildSymbole({ icons }: { icons: LabelIcon[] }) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const [entfernt, starten] = useTransition();

  async function hochladen(datei: File | undefined) {
    if (!datei) return;
    if (!ALLOWED_IMAGE_TYPES.includes(datei.type)) {
      toast.error("Nur JPEG, PNG, WebP oder AVIF.");
      return;
    }
    if (datei.size > MAX_IMAGE_BYTES) {
      toast.error("Das Bild ist größer als 5 MB.");
      return;
    }

    setLaedt(true);
    const supabase = createClient();
    const endung = datei.name.split(".").pop()?.toLowerCase() ?? "png";
    const pfad = `etiketten/${crypto.randomUUID()}.${endung}`;

    const { error } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(pfad, datei, { contentType: datei.type });

    if (error) {
      setLaedt(false);
      toast.error("Der Upload ist fehlgeschlagen.");
      return;
    }

    // Der Dateiname ohne Endung als Bezeichnung: „lego-logo.png" wird zu
    // „lego-logo". Ein Pflichtfeld davor wäre eine Frage zwischen Auswahl und
    // Ergebnis; umbenennen kann man später immer noch, indem man neu hochlädt.
    const name = datei.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Symbol";
    const ergebnis = await createLabelIcon({ name, path: pfad });

    setLaedt(false);
    if (eingabe.current) eingabe.current.value = "";

    if (ergebnis.error) {
      await supabase.storage.from(PRODUCT_BUCKET).remove([pfad]);
      toast.error(ergebnis.error);
      return;
    }

    toast.success(`Symbol „${name}" gespeichert.`);
    router.refresh();
  }

  function loeschen(icon: LabelIcon) {
    starten(async () => {
      const ergebnis = await deleteLabelIcon(icon.id);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success("Symbol gelöscht.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Symbole</h2>
          <p className="text-xs text-muted-foreground">
            Einmal hochladen, danach auf jedem Schild anwählbar. Freigestellte
            PNG mit durchsichtigem Hintergrund sehen auf rotem Grund am besten
            aus.
          </p>
        </div>

        <input
          ref={eingabe}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="sr-only"
          id="preisschild-symbol"
          aria-label="Symboldatei auswählen"
          onChange={(event) => void hochladen(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={laedt}
          onClick={() => eingabe.current?.click()}
        >
          {laedt ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="size-4" aria-hidden />
          )}
          Symbol hochladen
        </Button>
      </div>

      {icons.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-3">
          {icons.map((icon) => (
            <li
              key={icon.id}
              className="group relative flex w-24 flex-col items-center gap-1 rounded-md border border-border p-2"
            >
              <div className="flex size-12 items-center justify-center">
                {icon.url ? (
                  // Wie in der Schildvorschau: wenige Kilobyte, kein Kandidat
                  // für die Bildoptimierung.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon.url}
                    alt=""
                    className="max-h-12 max-w-12 object-contain"
                  />
                ) : (
                  <ImagePlus
                    className="size-5 text-muted-foreground/50"
                    aria-hidden
                  />
                )}
              </div>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                {icon.name}
              </span>
              <button
                type="button"
                disabled={entfernt}
                onClick={() => loeschen(icon)}
                aria-label={`Symbol „${icon.name}" löschen`}
                className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Noch keine Symbole. Ohne Symbol steht auf dem Schild nur die
          Bezeichnung – das ist der Normalfall.
        </p>
      )}
    </div>
  );
}

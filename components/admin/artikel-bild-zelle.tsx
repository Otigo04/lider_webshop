"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addProductImages } from "@/lib/actions/admin-products";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_BUCKET,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Bildzelle der Artikelliste: zeigt das erste Foto oder die Aufforderung, eins
 * hochzuladen. Klick oder Ablegen einer Datei lädt sofort hoch und hängt das
 * Foto hinter die vorhandenen – der Weg über den Stift ist dafür nicht nötig.
 * Löschen und Umsortieren bleiben im Artikel.
 */
export function ArtikelBildZelle({
  productId,
  name,
  url,
  anzahl,
}: {
  productId: string;
  name: string;
  /** Signierte URL des ersten Fotos; null = kein Foto (oder nicht lesbar) */
  url: string | null;
  anzahl: number;
}) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [darueber, setDarueber] = useState(false);

  async function hochladen(dateien: FileList | File[] | null) {
    if (!dateien || dateien.length === 0 || laeuft) return;
    setLaeuft(true);
    const supabase = createClient();
    const pfade: string[] = [];

    for (const datei of Array.from(dateien)) {
      if (!ALLOWED_IMAGE_TYPES.includes(datei.type)) {
        toast.error(`${datei.name}: nur JPEG, PNG, WebP oder AVIF`);
        continue;
      }
      if (datei.size > MAX_IMAGE_BYTES) {
        toast.error(`${datei.name}: größer als 5 MB`);
        continue;
      }
      const endung = datei.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const pfad = `${productId}/${crypto.randomUUID()}.${endung}`;
      const { error } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .upload(pfad, datei, { contentType: datei.type });
      if (error) {
        toast.error(`${datei.name}: Upload fehlgeschlagen`);
        continue;
      }
      pfade.push(pfad);
    }

    if (pfade.length > 0) {
      const ergebnis = await addProductImages(productId, pfade);
      if (ergebnis.error) {
        // Dateien ohne Datenbankeintrag nicht im Bucket liegen lassen.
        await supabase.storage.from(PRODUCT_BUCKET).remove(pfade);
        toast.error(ergebnis.error);
      } else {
        toast.success(ergebnis.success ?? "Gespeichert.");
        router.refresh();
      }
    }

    setLaeuft(false);
    if (eingabe.current) eingabe.current.value = "";
  }

  const ohneFoto = anzahl === 0;

  return (
    <div className="w-14">
      <button
        type="button"
        onClick={() => eingabe.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDarueber(true);
        }}
        onDragLeave={() => setDarueber(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDarueber(false);
          hochladen(event.dataTransfer.files);
        }}
        disabled={laeuft}
        title={ohneFoto ? "Foto hochladen" : "Weiteres Foto hinzufügen"}
        className={cn(
          "group relative flex size-14 items-center justify-center overflow-hidden rounded-md border text-muted-foreground transition-colors",
          ohneFoto
            ? "border-dashed border-signal/50 bg-signal/5 hover:border-signal"
            : "border-border bg-card hover:border-brand/50",
          darueber && "border-brand bg-brand-soft",
        )}
      >
        {url ? (
          <Image
            src={url}
            alt=""
            fill
            sizes="56px"
            className="object-contain p-0.5"
          />
        ) : null}

        {laeuft ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/80">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </span>
        ) : ohneFoto ? (
          <ImagePlus className="size-5" aria-hidden />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
            <ImagePlus className="size-4" aria-hidden />
          </span>
        )}

        {anzahl > 1 ? (
          <span className="absolute right-0 top-0 rounded-bl bg-foreground px-1 text-[10px] leading-4 text-background tabular">
            {anzahl}
          </span>
        ) : null}
        <span className="sr-only">
          {ohneFoto
            ? `Foto für ${name} hochladen`
            : `${anzahl} Fotos von ${name}, weiteres hinzufügen`}
        </span>
      </button>

      {ohneFoto && !laeuft ? (
        <p className="mt-0.5 text-center text-[10px] font-medium text-signal">
          Kein Foto
        </p>
      ) : null}

      <input
        ref={eingabe}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => hochladen(event.target.files)}
      />
    </div>
  );
}

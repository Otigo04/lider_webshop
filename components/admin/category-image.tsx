"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateCategoryImage } from "@/lib/actions/admin-categories";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_BUCKET,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Kachelbild einer Warengruppe – hochladen, austauschen, entfernen.
 *
 * Die Datei geht wie beim Produktfoto direkt aus dem Browser in den Storage
 * (`kategorien/<id>/…`), nicht durch eine Server Action: ein Bild von mehreren
 * Megabyte durch eine Formularübertragung zu schicken wäre der Umweg. Die
 * Server Action bekommt danach nur den Pfad.
 *
 * Beim Austauschen wird die alte Datei gelöscht, nachdem der neue Pfad steht.
 * Andersherum stünde bei einem Abbruch ein Verweis auf eine Datei, die es
 * nicht mehr gibt.
 */
export function CategoryImage({
  categoryId,
  imagePath,
  imageUrl,
  name,
}: {
  categoryId: string;
  imagePath: string | null;
  imageUrl: string | null;
  name: string;
}) {
  const router = useRouter();
  const eingabe = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);
  const [speichert, starten] = useTransition();
  const [vorschau, setVorschau] = useState(imageUrl);

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
    const endung = datei.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const pfad = `kategorien/${categoryId}/${crypto.randomUUID()}.${endung}`;

    const { error } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(pfad, datei, { contentType: datei.type });

    if (error) {
      setLaedt(false);
      toast.error("Der Upload ist fehlgeschlagen.");
      return;
    }

    const ergebnis = await updateCategoryImage({ id: categoryId, path: pfad });
    if (ergebnis.error) {
      setLaedt(false);
      toast.error(ergebnis.error);
      return;
    }

    if (imagePath) {
      await supabase.storage.from(PRODUCT_BUCKET).remove([imagePath]);
    }

    const { data } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .createSignedUrl(pfad, 3600);
    setVorschau(data?.signedUrl ?? null);
    setLaedt(false);
    if (eingabe.current) eingabe.current.value = "";
    toast.success(`Bild für „${name}" gespeichert.`);
    router.refresh();
  }

  function entfernen() {
    starten(async () => {
      const ergebnis = await updateCategoryImage({ id: categoryId, path: null });
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      if (imagePath) {
        await createClient().storage.from(PRODUCT_BUCKET).remove([imagePath]);
      }
      setVorschau(null);
      toast.success("Bild entfernt.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
        {vorschau ? (
          <Image
            src={vorschau}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <ImagePlus
            className="absolute inset-0 m-auto size-5 text-muted-foreground/50"
            aria-hidden
          />
        )}
        {laedt ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-4 animate-spin" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-1">
        <input
          ref={eingabe}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="sr-only"
          id={`kategoriebild-${categoryId}`}
          onChange={(event) => void hochladen(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={laedt || speichert}
          onClick={() => eingabe.current?.click()}
        >
          {vorschau ? "Austauschen" : "Bild wählen"}
        </Button>
        {vorschau ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={laedt || speichert}
            onClick={entfernen}
          >
            <Trash2 className="size-3.5" aria-hidden /> Entfernen
          </Button>
        ) : null}
      </div>
    </div>
  );
}

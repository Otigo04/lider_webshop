"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { saveSlide } from "@/lib/actions/home-slides";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { createClient } from "@/lib/supabase/client";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, PRODUCT_BUCKET } from "@/lib/constants";
import { HomeSlider } from "@/components/home-slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HomeSlide } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Bild {
  pfad: string;
  url: string;
}

function berlinTag(iso: string | null, minusEinTag = false): string {
  if (!iso) return "";
  const t = new Date(iso).getTime() - (minusEinTag ? 1 : 0);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(t);
}

/**
 * Bildfeld: lädt direkt aus dem Browser nach startseite/<uuid>.<ext>, wie das
 * Kachelbild der Warengruppe. Die alte Datei räumt die Server Action beim
 * Speichern auf.
 */
function BildFeld({
  label,
  hinweis,
  bild,
  onChange,
  pflicht,
  hochformat,
}: {
  label: string;
  hinweis: string;
  bild: Bild | null;
  onChange: (bild: Bild | null) => void;
  pflicht?: boolean;
  hochformat?: boolean;
}) {
  const eingabe = useRef<HTMLInputElement>(null);
  const [laedt, setLaedt] = useState(false);

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
    const endung = (datei.name.split(".").pop() ?? "jpg").toLowerCase().replace("jpeg", "jpg");
    const pfad = `startseite/${crypto.randomUUID()}.${endung}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(PRODUCT_BUCKET)
      .upload(pfad, datei, { contentType: datei.type, upsert: false });
    setLaedt(false);
    if (eingabe.current) eingabe.current.value = "";
    if (error) {
      console.error("[slider] Upload:", error.message);
      toast.error("Das Bild konnte nicht hochgeladen werden.");
      return;
    }
    // Vorschau aus der lokalen Datei – die signierte URL gibt es erst nach dem Speichern.
    onChange({ pfad, url: URL.createObjectURL(datei) });
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {pflicht ? <span className="text-destructive"> *</span> : null}
      </Label>
      <div
        className={cn(
          "relative overflow-hidden rounded-md border border-dashed border-border bg-muted/40",
          hochformat ? "aspect-square w-32" : "aspect-[3/1] w-full",
        )}
      >
        {bild ? (
          <>
            <Image src={bild.url} alt="" fill sizes="400px" className="object-cover" unoptimized />
            {pflicht ? null : (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-foreground shadow hover:bg-white"
                aria-label="Bild entfernen"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => eingabe.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {laedt ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-5" aria-hidden />
            )}
            {laedt ? "Lädt hoch …" : "Bild wählen"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {bild ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => eingabe.current?.click()}
            disabled={laedt}
          >
            {laedt ? "Lädt hoch …" : "Austauschen"}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{hinweis}</p>
      </div>
      <input
        ref={eingabe}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => hochladen(e.target.files?.[0])}
      />
    </div>
  );
}

function SubmitButton({ isEdit, disabled }: { isEdit: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} className="w-full">
      {pending ? "Wird gespeichert …" : isEdit ? "Änderungen speichern" : "Werbebild anlegen"}
    </Button>
  );
}

export function SlideEditor({
  slide,
  imageUrl,
  mobileImageUrl,
}: {
  slide?: HomeSlide;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
}) {
  const isEdit = Boolean(slide);
  const [state, formAction] = useActionState<AdminFormState, FormData>(saveSlide, {});
  const router = useRouter();

  const [bild, setBild] = useState<Bild | null>(
    slide && imageUrl ? { pfad: slide.image_path, url: imageUrl } : null,
  );
  const [mobil, setMobil] = useState<Bild | null>(
    slide?.mobile_image_path && mobileImageUrl
      ? { pfad: slide.mobile_image_path, url: mobileImageUrl }
      : null,
  );
  const [title, setTitle] = useState(slide?.title ?? "");
  const [subtitle, setSubtitle] = useState(slide?.subtitle ?? "");
  const [cta, setCta] = useState(slide?.cta_label ?? "");
  const [link, setLink] = useState(slide?.link_url ?? "");
  const [tone, setTone] = useState<"dark" | "light">(slide?.tone ?? "dark");

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (!state.success) return;
    toast.success(state.success);
    router.push("/admin/startseite");
    router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-5">
      {slide ? <input type="hidden" name="id" value={slide.id} /> : null}
      <input type="hidden" name="image_path" value={bild?.pfad ?? ""} />
      <input type="hidden" name="mobile_image_path" value={mobil?.pfad ?? ""} />
      <input type="hidden" name="tone" value={tone} />

      {bild ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Vorschau</p>
          <div className="overflow-hidden rounded-md border border-border">
            <HomeSlider
              slides={[
                {
                  id: "vorschau",
                  title: title.trim() || null,
                  subtitle: subtitle.trim() || null,
                  ctaLabel: cta.trim() || null,
                  href: null,
                  imageUrl: bild.url,
                  mobileImageUrl: null,
                  tone,
                },
              ]}
            />
          </div>
          {link && cta ? (
            <p className="text-xs text-muted-foreground">
              Der Knopf erscheint auf der Startseite, in der Vorschau ist er ohne Link nur angedeutet.
            </p>
          ) : null}
        </div>
      ) : null}

      <BildFeld
        label="Bild (Desktop)"
        hinweis="Querformat, ideal 1920 × 640 px (3:1), max. 5 MB."
        bild={bild}
        onChange={setBild}
        pflicht
      />
      <BildFeld
        label="Bild fürs Telefon (optional)"
        hinweis="Etwa 1080 × 900 px (6:5). Ohne wird das Desktop-Bild beschnitten."
        bild={mobil}
        onChange={setMobil}
        hochformat
      />

      <div className="space-y-1.5">
        <Label htmlFor="title">Überschrift</Label>
        <Input
          id="title"
          name="title"
          maxLength={90}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z. B. Herbstaktion: 15 % auf Leuchtmittel"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="subtitle">Unterzeile</Label>
        <Input
          id="subtitle"
          name="subtitle"
          maxLength={200}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="z. B. Nur bis 31. Oktober, solange der Vorrat reicht"
        />
        <p className="text-xs text-muted-foreground">
          Beides leer lassen, wenn der Text schon im Bild steht.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="link_url">Link</Label>
          <Input
            id="link_url"
            name="link_url"
            maxLength={300}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/shop/reduziert"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cta_label">Knopftext</Label>
          <Input
            id="cta_label"
            name="cta_label"
            maxLength={40}
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Zu den Angeboten"
            disabled={!link}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Textfarbe</Label>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(
            [
              ["dark", "Weiß auf dunklem Verlauf"],
              ["light", "Dunkel auf hellem Verlauf"],
            ] as const
          ).map(([wert, label]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setTone(wert)}
              aria-pressed={tone === wert}
              className={cn(
                "rounded px-2 py-1.5 text-xs font-medium transition-colors",
                tone === wert ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="valid_from">Zeigen ab</Label>
          <Input
            id="valid_from"
            name="valid_from"
            type="date"
            defaultValue={berlinTag(slide?.valid_from ?? null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valid_until">Zeigen bis</Label>
          <Input
            id="valid_until"
            name="valid_until"
            type="date"
            defaultValue={berlinTag(slide?.valid_until ?? null, true)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={slide?.is_active ?? true}
          className="size-4 accent-[var(--brand)]"
        />
        Auf der Startseite zeigen
      </label>

      <SubmitButton isEdit={isEdit} disabled={!bild} />
    </form>
  );
}

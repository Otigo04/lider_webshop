"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { saveProduct } from "@/lib/actions/admin-products";
import { analyzeProductPhoto } from "@/lib/actions/product-ai";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_BUCKET,
} from "@/lib/constants";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Category, ProductVariant } from "@/lib/types";

interface TierRow {
  key: string;
  min_quantity: string;
  max_quantity: string;
  unit_price: string;
}

interface ImageRow {
  file_path: string;
  url: string | null;
}

interface ProductFormProps {
  categories: Category[];
  /** undefined = neuer Artikel */
  product?: {
    id: string;
    category_id: string;
    sku: string;
    name: string;
    description: string | null;
    is_active: boolean;
    stock_available: number;
    variants: ProductVariant[];
    images: { file_path: string }[];
  };
  /** Signierte Vorschau-URLs zu product.images, gleiche Reihenfolge */
  imageUrls?: (string | null)[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Artikel speichern"}
    </Button>
  );
}

export function ProductForm({
  categories,
  product,
  imageUrls = [],
}: ProductFormProps) {
  const router = useRouter();
  const isNew = !product;

  // ID wird schon vor dem ersten Speichern vergeben, damit Uploads direkt im
  // Ordner des Artikels landen und nichts nachträglich umgehängt werden muss.
  const [productId] = useState(() => product?.id ?? crypto.randomUUID());

  // Kontrolliert statt defaultValue, damit die KI-Fotoanalyse leere Felder
  // nach dem ersten Upload befüllen kann (siehe handleUpload).
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [analyzing, setAnalyzing] = useState(false);

  const [tiers, setTiers] = useState<TierRow[]>(() =>
    product && product.variants.length > 0
      ? [...product.variants]
          .sort((a, b) => a.min_quantity - b.min_quantity)
          .map((variant) => ({
            key: variant.id,
            min_quantity: String(variant.min_quantity),
            max_quantity: variant.max_quantity ? String(variant.max_quantity) : "",
            unit_price: String(variant.unit_price),
          }))
      : [{ key: crypto.randomUUID(), min_quantity: "1", max_quantity: "", unit_price: "" }],
  );

  const [images, setImages] = useState<ImageRow[]>(() =>
    (product?.images ?? []).map((image, index) => ({
      file_path: image.file_path,
      url: imageUrls[index] ?? null,
    })),
  );
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [state, formAction] = useActionState<AdminFormState, FormData>(
    saveProduct,
    {},
  );

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    if (isNew) router.push(`/admin/products/${productId}/edit`);
    else router.refresh();
  }, [state.success, isNew, productId, router]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    const added: ImageRow[] = [];
    const isFirstUpload = isNew && images.length === 0;

    for (const file of Array.from(files)) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: nur JPEG, PNG, WebP oder AVIF`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name}: größer als 5 MB`);
        continue;
      }

      const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${productId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .upload(path, file, { contentType: file.type });

      if (error) {
        toast.error(`${file.name}: Upload fehlgeschlagen`);
        continue;
      }

      const { data } = await supabase.storage
        .from(PRODUCT_BUCKET)
        .createSignedUrl(path, 3600);

      added.push({ file_path: path, url: data?.signedUrl ?? null });
    }

    setImages((current) => [...current, ...added]);
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";

    // Nur beim allerersten Foto eines neuen Artikels: KI schlägt Name,
    // Beschreibung und Kategorie vor. Nie beim Bearbeiten (Daten existieren
    // schon) und nie ohne erfolgreichen Upload.
    if (isFirstUpload && added[0]?.url) {
      void runAnalysis(added[0].url);
    }
  }

  async function runAnalysis(imageUrl: string) {
    setAnalyzing(true);
    const result = await analyzeProductPhoto(imageUrl);
    setAnalyzing(false);

    if (result.error || !result.data) {
      toast.info("KI-Vorschlag nicht verfügbar – bitte manuell ausfüllen.");
      return;
    }

    // Nur leere Felder befüllen, falls der Admin während des Uploads schon
    // selbst zu tippen angefangen hat.
    setName((current) => current || result.data!.name);
    setDescription((current) => current || result.data!.description);
    if (result.data.category_id) {
      setCategoryId((current) => current || result.data!.category_id!);
    }
  }

  async function handleRemoveImage(path: string) {
    const supabase = createClient();
    await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
    setImages((current) => current.filter((image) => image.file_path !== path));
  }

  const payload = {
    id: productId,
    category_id: categoryId,
    name,
    description,
    is_active: true,
    stock_available: 0,
    tiers: tiers.map((tier) => ({
      min_quantity: tier.min_quantity,
      max_quantity: tier.max_quantity === "" ? null : tier.max_quantity,
      unit_price: tier.unit_price,
    })),
    images: images.map((image, index) => ({
      file_path: image.file_path,
      display_order: index,
    })),
  };

  return (
    <form
      action={(formData) => {
        // Bestand und Sichtbarkeit liest der Browser selbst aus, Name/
        // Beschreibung/Kategorie kommen aus State (KI kann sie vorbefüllen),
        // Staffeln und Bilder als JSON dazu.
        const merged = {
          ...payload,
          is_active: formData.get("is_active") === "on",
          stock_available: String(formData.get("stock_available") ?? "0"),
        };
        formData.set("payload", JSON.stringify(merged));
        return formAction(formData);
      }}
      className="space-y-8"
    >
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sku">Artikelnummer</Label>
          <Input
            id="sku"
            value={product?.sku ?? "wird beim Speichern vergeben"}
            readOnly
            disabled
            className="tabular"
          />
          <p className="text-xs text-muted-foreground">
            Wird automatisch aus dem Nummernkreis der Kategorie gebildet und
            ändert sich später nicht mehr.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category_id">Kategorie</Label>
          <select
            id="category_id"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="" disabled>
              Bitte wählen
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Bezeichnung</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={200}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={5000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stock_available">Bestand</Label>
          <Input
            id="stock_available"
            name="stock_available"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.stock_available ?? 0}
            className="tabular"
          />
        </div>

        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox
            id="is_active"
            name="is_active"
            defaultChecked={product?.is_active ?? true}
          />
          <Label htmlFor="is_active" className="font-normal">
            Im Shop sichtbar
          </Label>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Preisstaffeln</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setTiers((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
                  min_quantity: "",
                  max_quantity: "",
                  unit_price: "",
                },
              ])
            }
          >
            <Plus className="size-4" /> Staffel
          </Button>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Höchstmenge leer lassen für die offene Staffel nach oben (z. B.
          „ab 200 Stück“).
        </p>

        <div className="mt-4 space-y-3">
          {tiers.map((tier, index) => (
            <div key={tier.key} className="flex flex-wrap items-end gap-3">
              <div className="w-32 space-y-1">
                <Label className="text-xs">ab Menge</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={tier.min_quantity}
                  className="tabular"
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, min_quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </div>

              <div className="w-32 space-y-1">
                <Label className="text-xs">bis Menge</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="offen"
                  value={tier.max_quantity}
                  className="tabular"
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, max_quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </div>

              <div className="w-36 space-y-1">
                <Label className="text-xs">Preis / Stück (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tier.unit_price}
                  className="tabular"
                  onChange={(event) =>
                    setTiers((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, unit_price: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </div>

              <p className="min-w-24 pb-2 text-sm text-muted-foreground tabular">
                {tier.unit_price ? formatPrice(tier.unit_price) : ""}
              </p>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Staffel entfernen"
                disabled={tiers.length === 1}
                onClick={() =>
                  setTiers((current) => current.filter((_, i) => i !== index))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium">Fotos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          JPEG, PNG, WebP oder AVIF, maximal 5 MB. Das erste Foto ist das
          Titelbild.
        </p>
        {isNew ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Das erste Foto schlägt automatisch Bezeichnung, Beschreibung und
            Kategorie vor – Felder oben bleiben trotzdem editierbar.
          </p>
        ) : null}
        {analyzing ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-4 animate-pulse" aria-hidden />
            KI analysiert Foto …
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {images.map((image) => (
            <div
              key={image.file_path}
              className="relative size-28 overflow-hidden rounded-md border border-border bg-muted"
            >
              {image.url ? (
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain p-1"
                />
              ) : null}
              <button
                type="button"
                aria-label="Foto entfernen"
                onClick={() => handleRemoveImage(image.file_path)}
                className="absolute right-1 top-1 rounded-md bg-background/90 p-1 text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}

          <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground">
            <Upload className="size-5" aria-hidden />
            {uploading ? "lädt …" : "Hochladen"}
            <input
              ref={fileInput}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(event) => handleUpload(event.target.files)}
            />
          </label>
        </div>
      </section>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <SubmitButton />
        <Button asChild variant="ghost">
          <Link href="/admin/products">Abbrechen</Link>
        </Button>
      </div>
    </form>
  );
}

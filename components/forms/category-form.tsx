"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  saveCategory,
  type AdminFormState,
} from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/types";

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : isEdit ? "Änderungen speichern" : "Anlegen"}
    </Button>
  );
}

export function CategoryForm({ category }: { category?: Category }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    saveCategory,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.push("/admin/categories");
    router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={category?.name}
          required
          maxLength={80}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Kürzel für die URL</Label>
        <Input
          id="slug"
          name="slug"
          defaultValue={category?.slug}
          maxLength={80}
          placeholder="wird sonst aus dem Namen gebildet"
        />
        <p className="text-xs text-muted-foreground">
          Erscheint in der Adresse: /shop/handyzubehoer
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Beschreibung</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={category?.description ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sku_prefix">Nummernkreis</Label>
        <Input
          id="sku_prefix"
          name="sku_prefix"
          defaultValue={category?.sku_prefix ?? ""}
          maxLength={2}
          inputMode="numeric"
          placeholder="wird automatisch vergeben"
          className="tabular w-32"
        />
        <p className="text-xs text-muted-foreground">
          Zwei Ziffern. Artikel dieser Kategorie bekommen daraus ihre Nummer,
          z. B. {category?.sku_prefix ?? "12"}-0001.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="order_index">Reihenfolge</Label>
        <Input
          id="order_index"
          name="order_index"
          type="number"
          min={0}
          step={1}
          defaultValue={category?.order_index ?? 0}
          className="tabular w-32"
        />
        <p className="text-xs text-muted-foreground">
          Kleinere Zahl steht im Shop weiter vorn.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <SubmitButton isEdit={Boolean(category)} />
        {category ? (
          <Button asChild variant="ghost">
            <Link href="/admin/categories">Abbrechen</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

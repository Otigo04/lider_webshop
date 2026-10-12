"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { saveShopTexte } from "@/lib/actions/shop-texte";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SHOP_TEXT_KEYS,
  SHOP_TEXT_LABELS,
  SHOP_TEXT_MAX,
  SHOP_TEXT_STANDARD,
  type ShopTextKey,
} from "@/lib/shop-texte";

function Speichern() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Speichert …" : "Texte speichern"}
    </Button>
  );
}

/**
 * Der Satz unter der Überschrift der Sonderseiten. `texte` ist der
 * wirksame Text (Standard oder überschrieben); ein Feld, das dem Standard
 * entspricht, wird leer gezeigt – Leer heißt „Standard", und der steht als
 * Platzhalter darin.
 */
export function ShopTexteSettings({
  texte,
}: {
  texte: Record<ShopTextKey, string>;
}) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    saveShopTexte,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-5">
      {SHOP_TEXT_KEYS.map((key) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`shop-text-${key}`}>{SHOP_TEXT_LABELS[key]}</Label>
          <Textarea
            id={`shop-text-${key}`}
            name={key}
            rows={2}
            maxLength={SHOP_TEXT_MAX}
            defaultValue={texte[key] === SHOP_TEXT_STANDARD[key] ? "" : texte[key]}
            placeholder={SHOP_TEXT_STANDARD[key]}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Leer lassen = der graue Standardtext gilt.
      </p>
      <Speichern />
    </form>
  );
}

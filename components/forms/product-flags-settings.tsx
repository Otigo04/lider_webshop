"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  createProductFlag,
  deleteProductFlag,
} from "@/lib/actions/product-flags";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductFlagDef } from "@/lib/types";

const FARBEN = [1, 2, 3, 4, 5, 6];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird angelegt …" : "Anlegen"}
    </Button>
  );
}

/**
 * Frei definierbare Artikel-Flags – rein intern zum Organisieren/Filtern in
 * der Artikelverwaltung (Migration 021). Kein Umbenennen-Dialog: Löschen und
 * Neuanlegen reicht für den seltenen Fall.
 */
export function ProductFlagsSettings({ flags }: { flags: ProductFlagDef[] }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    createProductFlag,
    {},
  );
  const [farbe, setFarbe] = useState(1);
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state.success, router]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  async function handleDelete(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    const result = await deleteProductFlag({}, formData);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success ?? "Gelöscht.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine eigenen Flags angelegt.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {flags.map((flag) => (
            <li
              key={flag.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className={`size-2.5 shrink-0 rounded-full tag-dot-${flag.color}`}
                />
                {flag.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(flag.id)}
              >
                Löschen
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="flag-name" className="text-xs text-muted-foreground">
            Neues Flag
          </label>
          <Input
            id="flag-name"
            name="name"
            maxLength={60}
            placeholder="z. B. Auslaufartikel"
            className="w-56"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs text-muted-foreground">Farbe</span>
          <div className="flex gap-1.5">
            {FARBEN.map((wert) => (
              <button
                key={wert}
                type="button"
                aria-label={`Farbe ${wert}`}
                aria-pressed={farbe === wert}
                onClick={() => setFarbe(wert)}
                className={`size-6 rounded-full tag-dot-${wert} ${
                  farbe === wert ? "ring-2 ring-offset-2 ring-ring" : ""
                }`}
              />
            ))}
          </div>
          <input type="hidden" name="color" value={farbe} />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

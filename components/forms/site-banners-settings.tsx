"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  createSiteBanner,
  deleteSiteBanner,
  updateSiteBanner,
} from "@/lib/actions/site-banners";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { BANNER_TONE_CLASSES } from "@/components/announcement-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  SITE_BANNER_TONE_LABELS,
  type SiteBanner,
  type SiteBannerTone,
} from "@/lib/types";

const TOENE = Object.keys(SITE_BANNER_TONE_LABELS) as SiteBannerTone[];

/**
 * Pflege der Hinweisleiste über der Kopfleiste (Migration 035).
 *
 * Jeder Hinweis ist ein eigenes kleines Formular: so speichert ein Klick genau
 * die Zeile, an der gerade getippt wurde, und nicht versehentlich eine halb
 * bearbeitete zweite mit.
 */
export function SiteBannersSettings({
  banners,
  verfuegbar,
}: {
  banners: SiteBanner[];
  verfuegbar: boolean;
}) {
  if (!verfuegbar) {
    return (
      <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
        Die Tabelle für die Hinweisleiste fehlt noch. Bitte
        <code className="code mx-1">supabase/migrations/035_hinweisleiste.sql</code>
        im Supabase SQL-Editor ausführen. Bis dahin zeigt die Leiste den
        Versandhinweis mit der Freigrenze aus den Firmendaten.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {banners.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Kein Hinweis angelegt – die Leiste ist ausgeblendet.
        </p>
      ) : (
        <ul className="space-y-3">
          {banners.map((banner) => (
            <li key={banner.id}>
              <BannerFormular banner={banner} />
            </li>
          ))}
        </ul>
      )}

      <details className="group rounded-md border border-dashed border-border p-4 open:border-solid">
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Neuen Hinweis anlegen
        </summary>
        <div className="mt-4">
          <BannerFormular />
        </div>
      </details>
    </div>
  );
}

function Speichern({ neu }: { neu: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Speichert …" : neu ? "Anlegen" : "Speichern"}
    </Button>
  );
}

function BannerFormular({ banner }: { banner?: SiteBanner }) {
  const neu = !banner;
  const [text, setText] = useState(banner?.message ?? "");
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    async (vorher, formData) => {
      const ergebnis = neu
        ? await createSiteBanner(vorher, formData)
        : await updateSiteBanner(vorher, formData);
      // Das Anlegeformular leert sich nach Erfolg – bereit für den nächsten.
      if (neu && ergebnis.success) setText("");
      return ergebnis;
    },
    {},
  );
  const [ton, setTon] = useState<SiteBannerTone>(banner?.tone ?? "gold");
  const router = useRouter();
  const id = banner?.id ?? "neu";

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  async function loeschen() {
    if (!banner) return;
    const result = await deleteSiteBanner(banner.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success ?? "Gelöscht.");
    router.refresh();
  }

  return (
    <form
      action={formAction}
      className={cn("space-y-3", !neu && "rounded-md border border-border p-4")}
    >
      {banner ? <input type="hidden" name="id" value={banner.id} /> : null}

      {/* Vorschau in der echten Fläche – die Farbwahl sieht man, statt sie zu lesen. */}
      <div
        className={cn(
          "truncate rounded px-3 py-1.5 text-center text-xs font-medium",
          BANNER_TONE_CLASSES[ton],
        )}
      >
        {text || "Vorschau"}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`message-${id}`}>Text</Label>
        <Input
          id={`message-${id}`}
          name="message"
          required
          maxLength={160}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="z. B. Ab 300 € Nettowarenwert versandkostenfrei"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`link-${id}`}>Link (optional)</Label>
          <Input
            id={`link-${id}`}
            name="link_url"
            maxLength={300}
            defaultValue={banner?.link_url ?? ""}
            placeholder="/shop/reduziert"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`label-${id}`}>Linktext</Label>
          <Input
            id={`label-${id}`}
            name="link_label"
            maxLength={40}
            defaultValue={banner?.link_label ?? ""}
            placeholder="Mehr"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`tone-${id}`}>Farbe</Label>
          <select
            id={`tone-${id}`}
            name="tone"
            value={ton}
            onChange={(event) => setTon(event.target.value as SiteBannerTone)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {TOENE.map((wert) => (
              <option key={wert} value={wert}>
                {SITE_BANNER_TONE_LABELS[wert]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`order-${id}`}>Reihenfolge</Label>
          <Input
            id={`order-${id}`}
            name="order_index"
            type="number"
            min={0}
            max={999}
            defaultValue={banner?.order_index ?? 0}
            className="w-20"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={banner?.is_active ?? true}
            className="size-4 accent-brand"
          />
          Aktiv
        </label>

        <div className="ml-auto flex gap-2">
          {banner ? (
            <Button type="button" variant="ghost" size="sm" onClick={loeschen}>
              Löschen
            </Button>
          ) : null}
          <Speichern neu={neu} />
        </div>
      </div>
    </form>
  );
}

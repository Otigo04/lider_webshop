"use client";

import { useState } from "react";
import Image from "next/image";
import { BildVorschau, VORSCHAU_SOFORT_MS } from "@/components/bild-vorschau";
import { ShopImage } from "@/components/shop-image";
import { ImageOff } from "lucide-react";
import {
  AusverkauftBand,
  VorbestellBand,
  ausverkauftBild,
} from "@/components/ausverkauft-band";
import { RestpostenChip } from "@/components/product-flag-badges";
import type { RestpostenWare } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Signierte URLs, Reihenfolge wie display_order. Einträge können null sein. */
export function ProductGallery({
  urls,
  alt,
  ausverkauft = false,
  vorbestellbar = false,
  restposten = false,
  restpostenWare = null,
}: {
  urls: (string | null)[];
  alt: string;
  /** Band „Ausverkauft" auf dem großen Foto; der Artikel bleibt sichtbar. */
  ausverkauft?: boolean;
  /** Band „Vorbestellbar" statt „Ausverkauft": nicht da, aber bestellbar. */
  vorbestellbar?: boolean;
  /** Kennzeichen „Restposten" oben links auf dem großen Foto. */
  restposten?: boolean;
  /** Güteklasse neben dem Kennzeichen: A-Ware / B-Ware */
  restpostenWare?: RestpostenWare | null;
}) {
  const available = urls.filter((url): url is string => Boolean(url));
  const [active, setActive] = useState(0);

  if (available.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
        <ImageOff className="size-10" aria-hidden />
        <span className="sr-only">Kein Foto hinterlegt</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* In der Produktansicht kommt die große Vorschau sofort (und ist schon
          geladen); auf den Kacheln erst nach einigen Sekunden. */}
      <BildVorschau
        src={available[active]}
        alt={alt}
        verzoegerung={VORSCHAU_SOFORT_MS}
        vorladen
        className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
      >
        <ShopImage
          src={available[active]}
          alt={alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className={cn("object-contain p-6", ausverkauft && ausverkauftBild)}
          priority
        />
        {restposten ? (
          <RestpostenChip
            ware={restpostenWare}
            className="absolute left-3 top-3 z-10 px-2.5 py-1 text-sm"
          />
        ) : null}
        {ausverkauft ? <AusverkauftBand className="py-2 text-base" /> : null}
        {vorbestellbar ? <VorbestellBand className="py-2 text-base" /> : null}
      </BildVorschau>

      {available.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {available.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Foto ${index + 1} von ${available.length}`}
              aria-current={index === active}
              className={cn(
                "relative size-16 overflow-hidden rounded-md border bg-muted",
                index === active ? "border-foreground" : "border-border",
              )}
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="64px"
                className="object-contain p-1"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Signierte URLs, Reihenfolge wie display_order. Einträge können null sein. */
export function ProductGallery({
  urls,
  alt,
}: {
  urls: (string | null)[];
  alt: string;
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
      <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
        <Image
          src={available[active]}
          alt={alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain p-6"
          priority
        />
      </div>

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

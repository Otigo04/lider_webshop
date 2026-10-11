"use client";

import { useEffect, useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageOff } from "lucide-react";

/**
 * Produktfoto mit Rückfall. Der Bildoptimierer holt das Original von Supabase
 * und kann dabei auch einmal in eine Zeitüberschreitung laufen; ohne Rückfall
 * zeigt der Browser dann den Alt-Text als kaputtes Bild. Hier gibt es erst
 * einen zweiten Versuch (der Fehler ist meist einmalig, die Datei ist danach
 * warm), und scheitert auch der, den neutralen Platzhalter wie bei Artikeln
 * ohne Foto.
 */
export function ShopImage({ alt, ...props }: ImageProps) {
  const [versuch, setVersuch] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (versuch >= 2) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-8" aria-hidden />
        <span className="sr-only">Foto nicht verfügbar</span>
      </div>
    );
  }

  return (
    <Image
      key={versuch}
      alt={alt}
      {...props}
      onError={() => {
        if (versuch === 0) {
          timer.current = setTimeout(() => setVersuch(1), 1200);
        } else {
          setVersuch(2);
        }
      }}
    />
  );
}

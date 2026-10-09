"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { listenZiel, merkeWiederherstellen } from "@/lib/artikel-ruecksprung";

/**
 * Link zurück zur Artikelliste – an die Stelle, von der man kam. Der href
 * bleibt die frische Liste: Mittelklick und „In neuem Tab öffnen" tun, was
 * man von einem Link erwartet. Nur der normale Klick springt zur gemerkten
 * Suche.
 */
export function ZurueckZurListe({
  onClick,
  ...rest
}: Omit<React.ComponentProps<typeof Link>, "href">) {
  const router = useRouter();

  return (
    <Link
      {...rest}
      href="/admin/products"
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        merkeWiederherstellen();
        router.push(listenZiel());
      }}
    />
  );
}

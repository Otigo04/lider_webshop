"use client";

import { useEffect } from "react";
import {
  holeListe,
  merkeListe,
  nimmWiederherstellen,
} from "@/lib/artikel-ruecksprung";

const ZEILE = "artikel-";

/**
 * Sitzt unsichtbar in der Artikelliste und tut zwei Dinge:
 *
 * 1. Klickt man auf „Bearbeiten", merkt sie sich Adresse (mit Suche und
 *    Filtern), Scrollhöhe und Artikel. Per Klick-Abfang am Dokument, damit
 *    die Liste selbst eine Server Component bleibt.
 * 2. Kommt man mit gesetztem Rücksprung-Flag zurück, scrollt sie zur Zeile
 *    des zuletzt bearbeiteten Artikels – fehlt die (Filter geändert), auf die
 *    gespeicherte Höhe.
 */
export function ArtikelListeMerker() {
  useEffect(() => {
    if (nimmWiederherstellen()) {
      const merk = holeListe();
      if (merk) {
        // Nach dem Rendern: Next setzt beim Seitenwechsel selbst nach oben.
        requestAnimationFrame(() => {
          const zeile = merk.id
            ? document.getElementById(`${ZEILE}${merk.id}`)
            : null;
          if (zeile) zeile.scrollIntoView({ block: "center" });
          else window.scrollTo(0, merk.hoehe);
        });
      }
    }

    function beimKlick(event: MouseEvent) {
      const ziel = event.target;
      if (!(ziel instanceof Element)) return;
      const link = ziel.closest('a[href^="/admin/products/"][href$="/edit"]');
      if (!link) return;
      const zeile = link.closest("tr");
      merkeListe({
        adresse: window.location.pathname + window.location.search,
        hoehe: window.scrollY,
        id: zeile?.id.startsWith(ZEILE) ? zeile.id.slice(ZEILE.length) : null,
      });
    }

    document.addEventListener("click", beimKlick);
    return () => document.removeEventListener("click", beimKlick);
  }, []);

  return null;
}

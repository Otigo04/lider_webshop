"use client";

import { useEffect, useState } from "react";
import { signCartImages } from "@/lib/actions/cart-images";
import type { CartItem } from "@/lib/types";

/**
 * Bild-URLs zu den Warenkorbpositionen. Der Warenkorb speichert nur
 * Storage-Pfade (siehe CartItem.imagePath), signiert wird beim Anzeigen.
 *
 * Rückgabe ist eine Zuordnung Pfad → URL. Solange sie leer ist, zeigt die
 * Liste ihren Platzhalter – ein Bild, das eine Sekunde später erscheint, ist
 * besser als eine Liste, die auf es wartet.
 */
export function useCartImages(items: CartItem[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Als Schlüssel dient die sortierte Pfadliste: so löst erst das Hinzufügen
  // oder Entfernen einer Position eine neue Signaturrunde aus, nicht schon
  // eine geänderte Menge.
  const pfade = [...new Set(items.map((i) => i.imagePath).filter(Boolean))]
    .sort()
    .join("|");

  useEffect(() => {
    const liste = pfade ? pfade.split("|") : [];
    // Kein Pfad, nichts zu signieren. Der bisherige Bestand bleibt stehen –
    // nachgeschlagen wird ohnehin je Position, ein Eintrag zu einem längst
    // entfernten Artikel stört niemanden und ein setState im Effektrumpf
    // löste eine zweite Renderrunde aus.
    if (liste.length === 0) return;

    let aktuell = true;
    signCartImages(liste)
      .then((ergebnis) => {
        if (!aktuell) return;
        const map: Record<string, string> = {};
        liste.forEach((pfad, index) => {
          const url = ergebnis[index];
          if (url) map[pfad] = url;
        });
        setUrls(map);
      })
      .catch((fehler) => {
        // Ohne Bild ist der Warenkorb blasser, aber vollständig – kein Grund,
        // dem Kunden eine Fehlermeldung hinzustellen.
        console.error("[warenkorb] Bilder:", fehler);
      });

    return () => {
      aktuell = false;
    };
  }, [pfade]);

  return urls;
}

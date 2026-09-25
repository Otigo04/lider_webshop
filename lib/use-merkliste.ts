"use client";

import { useSyncExternalStore } from "react";
import {
  MERKLISTE_COOKIE,
  MERKLISTE_MAX,
  parseMerkliste,
  serializeMerkliste,
} from "@/lib/merkliste";

/*
 * Die Merkliste liegt im Cookie, also außerhalb von React – angebunden als
 * externer Store wie der Warenkorb (lib/cart-context.tsx). Der Server kennt
 * den Zustand nicht, getServerSnapshot liefert leer; das Herz ist beim ersten
 * Rendern deshalb hohl und füllt sich nach dem Einlesen.
 */

const LEER: string[] = [];
let ids: string[] = LEER;
let gelesen = false;
const zuhoerer = new Set<() => void>();

function lesen(): string[] {
  const eintrag = document.cookie
    .split("; ")
    .find((teil) => teil.startsWith(`${MERKLISTE_COOKIE}=`));
  return parseMerkliste(eintrag?.slice(MERKLISTE_COOKIE.length + 1));
}

function melden() {
  for (const z of zuhoerer) z();
}

function schreiben(naechste: string[]) {
  ids = naechste;
  // Ein Jahr: eine Merkliste soll den nächsten Besuch überleben.
  document.cookie = `${MERKLISTE_COOKIE}=${serializeMerkliste(naechste)}; path=/; max-age=31536000; samesite=lax`;
  melden();
}

function abonnieren(z: () => void) {
  zuhoerer.add(z);
  if (!gelesen) {
    gelesen = true;
    ids = lesen();
    // Anderer Reiter hat gemerkt: beim Zurückkehren neu einlesen. Cookies
    // kennen kein storage-Ereignis.
    window.addEventListener("focus", () => {
      const frisch = lesen();
      if (frisch.join(".") !== ids.join(".")) {
        ids = frisch;
        melden();
      }
    });
    melden();
  }
  return () => {
    zuhoerer.delete(z);
  };
}

/** Artikel merken oder wieder entfernen. Gibt den neuen Zustand zurück. */
export function merkenUmschalten(id: string): boolean {
  if (ids.includes(id)) {
    schreiben(ids.filter((x) => x !== id));
    return false;
  }
  // Neueste vorn; ist die Liste voll, fällt die älteste heraus.
  schreiben([id, ...ids].slice(0, MERKLISTE_MAX));
  return true;
}

export function useMerkliste(): string[] {
  return useSyncExternalStore(
    abonnieren,
    () => ids,
    () => LEER,
  );
}

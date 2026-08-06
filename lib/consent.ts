"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "lider.consent.v1";

/**
 * Notwendige Cookies (Login-Session) laufen immer – dafür ist keine
 * Einwilligung nötig (Art. 6 Abs. 1 lit. f DSGVO / § 25 Abs. 2 TTDSG).
 * `marketing` ist die einzige Kategorie, die eine Einwilligung braucht:
 * null = noch nicht entschieden (Banner sichtbar), sonst true/false.
 *
 * Skripte, die Marketing-Cookies setzen (sobald ein Anbieter feststeht),
 * dürfen erst nach `getConsent().marketing === true` geladen werden.
 */
interface ConsentState {
  marketing: boolean | null;
  /** false bis der localStorage gelesen ist – verhindert Hydration-Mismatch */
  ready: boolean;
}

/*
 * Wie lib/cart-context.tsx: ein externer Store außerhalb von React, per
 * useSyncExternalStore angebunden. Wichtig für React: getSnapshot() muss bei
 * jeder inhaltlichen Änderung eine NEUE Objektreferenz liefern – sonst hält
 * React ein `emit()` für ein No-Op und rendert nie neu. Ein früherer Fehler
 * hier gab bei leerem localStorage dieselbe EMPTY-Konstante zurück, wodurch
 * das Banner nach der Hydration nie erschien.
 */

const EMPTY: ConsentState = { marketing: null, ready: false };

let state: ConsentState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist(marketing: boolean | null) {
  state = { marketing, ready: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ marketing }));
  } catch {
    // Privater Modus oder voller Speicher: Entscheidung gilt nur für diese Sitzung.
  }
  emit();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { marketing: boolean | null }) : null;
    state = { marketing: parsed?.marketing ?? null, ready: true };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    state = { marketing: null, ready: true };
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrate();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConsentState {
  return state;
}

function getServerSnapshot(): ConsentState {
  return EMPTY;
}

export function acceptAllConsent() {
  persist(true);
}

export function rejectMarketingConsent() {
  persist(false);
}

/** Setzt die Entscheidung zurück – Banner erscheint wieder. */
export function resetConsent() {
  persist(null);
}

export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

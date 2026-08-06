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
export interface Consent {
  marketing: boolean | null;
}

const EMPTY: Consent = { marketing: null };

let state: Consent = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist(next: Consent) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
    state = raw ? (JSON.parse(raw) as Consent) : EMPTY;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    state = EMPTY;
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

function getSnapshot(): Consent {
  return state;
}

function getServerSnapshot(): Consent {
  return EMPTY;
}

export function acceptAllConsent() {
  persist({ marketing: true });
}

export function rejectMarketingConsent() {
  persist({ marketing: false });
}

/** Setzt die Entscheidung zurück – Banner erscheint wieder. */
export function resetConsent() {
  persist(EMPTY);
}

/**
 * `ready` ist erst nach dem ersten Client-Render true (localStorage ist
 * serverseitig nicht lesbar) – so lässt sich ein Hydration-Mismatch beim
 * Banner vermeiden, genau wie beim Warenkorb in lib/cart-context.tsx.
 */
export function useConsent(): Consent & { ready: boolean } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...snapshot, ready: hydrated };
}

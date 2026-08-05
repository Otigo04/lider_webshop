"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { lineTotal, minOrderQuantity } from "@/lib/pricing";
import type { CartItem } from "@/lib/types";

const STORAGE_KEY = "lider.cart.v1";

interface CartState {
  items: CartItem[];
  /** false bis der localStorage gelesen ist – verhindert Hydration-Mismatch */
  ready: boolean;
}

/*
 * Der Warenkorb liegt im localStorage, also außerhalb von React. Statt ihn in
 * einem Effect nachzuladen (was eine zweite Renderrunde auslöst), wird er als
 * externer Store angebunden: getServerSnapshot liefert leer, der Client liest
 * beim ersten Abonnieren nach.
 */

const EMPTY: CartState = { items: [], ready: false };

let state: CartState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setItems(next: CartItem[]) {
  state = { items: next, ready: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Privater Modus oder voller Speicher: Warenkorb bleibt für diese Sitzung.
  }
  emit();
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = { items: raw ? (JSON.parse(raw) as CartItem[]) : [], ready: true };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    state = { items: [], ready: true };
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

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return EMPTY;
}

// --- Mutationen -------------------------------------------------------------

function addItem(item: CartItem) {
  const current = state.items;
  const index = current.findIndex((i) => i.productId === item.productId);

  if (index === -1) {
    setItems([...current, item]);
    return;
  }

  // Schon im Korb: Mengen addieren, aber nicht über den Bestand hinaus.
  const next = [...current];
  next[index] = {
    ...next[index],
    tiers: item.tiers,
    maxStock: item.maxStock,
    quantity: Math.min(next[index].quantity + item.quantity, item.maxStock),
  };
  setItems(next);
}

function removeItem(productId: string) {
  setItems(state.items.filter((item) => item.productId !== productId));
}

function updateQuantity(productId: string, quantity: number) {
  setItems(
    state.items.map((item) => {
      if (item.productId !== productId) return item;
      const min = minOrderQuantity(item.tiers);
      return {
        ...item,
        quantity: Math.min(Math.max(quantity, min), item.maxStock),
      };
    }),
  );
}

function clear() {
  setItems([]);
}

// --- React-Anbindung --------------------------------------------------------

interface CartContextValue extends CartState {
  itemCount: number;
  total: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items: snapshot.items,
      ready: snapshot.ready,
      itemCount: snapshot.items.reduce((sum, item) => sum + item.quantity, 0),
      total: snapshot.items.reduce(
        (sum, item) => sum + lineTotal(item.tiers, item.quantity),
        0,
      ),
      addItem,
      removeItem,
      updateQuantity,
      clear,
    }),
    [snapshot],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart muss innerhalb von <CartProvider> stehen");
  }
  return context;
}

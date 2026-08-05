"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { lineTotal, minOrderQuantity } from "@/lib/pricing";
import type { CartItem } from "@/lib/types";

const STORAGE_KEY = "lider.cart.v1";

interface CartContextValue {
  items: CartItem[];
  /** false bis der localStorage gelesen ist – verhindert Hydration-Mismatch */
  ready: boolean;
  itemCount: number;
  total: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Erst nach dem Mount lesen: der Server kennt den localStorage nicht, sonst
  // weicht das erste Client-Render vom Server-HTML ab.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartItem[]);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const addItem = useCallback((item: CartItem) => {
    setItems((current) => {
      const index = current.findIndex((i) => i.productId === item.productId);
      if (index === -1) return [...current, item];

      // Schon im Korb: Mengen addieren, aber nicht über den Bestand hinaus.
      const next = [...current];
      const merged = next[index];
      next[index] = {
        ...merged,
        tiers: item.tiers,
        maxStock: item.maxStock,
        quantity: Math.min(merged.quantity + item.quantity, item.maxStock),
      };
      return next;
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item;
        const min = minOrderQuantity(item.tiers);
        const clamped = Math.min(Math.max(quantity, min), item.maxStock);
        return { ...item, quantity: clamped };
      }),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    return {
      items,
      ready,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      total: items.reduce(
        (sum, item) => sum + lineTotal(item.tiers, item.quantity),
        0,
      ),
      addItem,
      removeItem,
      updateQuantity,
      clear,
    };
  }, [items, ready, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart muss innerhalb von <CartProvider> stehen");
  }
  return context;
}

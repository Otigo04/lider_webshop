"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Package, Store } from "lucide-react";
import { createOrder, type CheckoutState } from "@/lib/actions/orders";
import { useCart } from "@/lib/cart-context";
import { formatPrice, formatQuantity } from "@/lib/format";
import { lineTotal, resolveTier } from "@/lib/pricing";
import { qualifiesForFreeShipping, shippingNote } from "@/lib/shipping";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { DeliveryMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

function DeliveryOption({
  method,
  current,
  onSelect,
  icon,
  title,
  text,
}: {
  method: DeliveryMethod;
  current: DeliveryMethod;
  onSelect: (method: DeliveryMethod) => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  const active = current === method;
  return (
    <button
      type="button"
      onClick={() => onSelect(method)}
      aria-pressed={active}
      className={cn(
        "flex gap-3 rounded-md border p-4 text-left",
        active
          ? "border-foreground bg-secondary"
          : "border-border hover:border-foreground/30",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? "Bestellung wird gesendet …" : "Bestellung aufgeben"}
    </Button>
  );
}

export function CheckoutForm({ defaultAddress }: { defaultAddress?: string }) {
  const { items, ready, total, clear } = useCart();
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("shipping");
  const [state, formAction] = useActionState<CheckoutState, FormData>(
    createOrder,
    {},
  );
  const router = useRouter();

  // Erst nach erfolgreicher Antwort leeren – sonst wäre der Warenkorb bei
  // einem Fehler (z. B. Bestand reicht nicht mehr) weg.
  useEffect(() => {
    if (!state.orderNumber) return;
    clear();
    router.push(`/orders?neu=${encodeURIComponent(state.orderNumber)}`);
  }, [state.orderNumber, clear, router]);

  if (!ready) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Ihr Warenkorb ist leer.
        </p>
        <Button asChild className="mt-4">
          <Link href="/shop">Zum Sortiment</Link>
        </Button>
      </div>
    );
  }

  const payload = items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
  }));

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />

      <div className="space-y-8">
        <section>
          <h2 className="font-medium">Bestellpositionen</h2>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {items.map((item) => {
              const tier = resolveTier(item.tiers, item.quantity);
              return (
                <li
                  key={item.productId}
                  className="flex flex-wrap items-baseline justify-between gap-2 p-4"
                >
                  <div>
                    <p className="text-xs text-muted-foreground tabular">
                      {item.productSku}
                    </p>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-muted-foreground tabular">
                      {formatQuantity(item.quantity)} ×{" "}
                      {tier ? formatPrice(tier.unit_price) : "–"}
                    </p>
                  </div>
                  <p className="font-semibold tabular">
                    {formatPrice(lineTotal(item.tiers, item.quantity))}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Maßgeblich sind die Preise und Bestände zum Zeitpunkt der Bestellung.
            Sie werden beim Absenden erneut geprüft.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Lieferung</h2>
          <input type="hidden" name="deliveryMethod" value={deliveryMethod} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DeliveryOption
              method="shipping"
              current={deliveryMethod}
              onSelect={setDeliveryMethod}
              icon={<Package className="size-5" aria-hidden />}
              title="Versand"
              text={
                qualifiesForFreeShipping(total)
                  ? "Kostenfrei ab 100 € netto – erreicht."
                  : "Kosten nach Gewicht und Ziel, Mitteilung mit der Auftragsbestätigung."
              }
            />
            <DeliveryOption
              method="pickup"
              current={deliveryMethod}
              onSelect={setDeliveryMethod}
              icon={<Store className="size-5" aria-hidden />}
              title="Selbstabholung"
              text="Abholung nach Bereitstellung, wir melden uns mit einem Termin."
            />
          </div>

          {deliveryMethod === "shipping" ? (
            <div className="mt-5 space-y-2">
              <Label htmlFor="deliveryAddress">Lieferadresse</Label>
              <Textarea
                id="deliveryAddress"
                name="deliveryAddress"
                rows={4}
                maxLength={500}
                defaultValue={defaultAddress}
                placeholder="Firma, Straße, PLZ Ort"
              />
              <p className="text-xs text-muted-foreground">
                Leer lassen, wenn an die hinterlegte Adresse geliefert werden
                soll.
              </p>
            </div>
          ) : null}
        </section>

        <section className="space-y-2">
          <Label htmlFor="notes">Anmerkungen</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={4}
            maxLength={2000}
            placeholder="Wunschtermin, Abweichungen, Rückfragen"
          />
        </section>
      </div>

      <aside className="h-fit rounded-md border border-border p-5">
        <h2 className="font-medium">Zusammenfassung</h2>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Summe netto</span>
          <span className="text-2xl font-semibold tabular">
            {formatPrice(total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">zzgl. USt.</p>
        {deliveryMethod === "shipping" ? (
          <p
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-xs",
              qualifiesForFreeShipping(total)
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            {shippingNote(total)}
          </p>
        ) : (
          <p className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Selbstabholung – es fallen keine Versandkosten an.
          </p>
        )}

        {state.error ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}

        <div className="mt-5">
          <SubmitButton disabled={items.length === 0} />
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
          <Link href="/cart">Zurück zum Warenkorb</Link>
        </Button>
      </aside>
    </form>
  );
}

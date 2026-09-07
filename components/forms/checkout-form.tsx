"use client";

import { useActionState, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Banknote, CreditCard, ImageOff, Landmark, Package, Store } from "lucide-react";
import { createOrder, type CheckoutState } from "@/lib/actions/orders";
import { useCart } from "@/lib/cart-context";
import { useCartImages } from "@/lib/use-cart-images";
import { formatPrice, formatQuantity } from "@/lib/format";
import { lineTotal, resolveTier } from "@/lib/pricing";
import { qualifiesForFreeShipping, shippingNote } from "@/lib/shipping";
import { steuer } from "@/lib/vat";
import { AddressFields } from "@/components/forms/address-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { DeliveryMethod, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Anschrift, wie sie im Konto hinterlegt ist. */
export interface HinterlegteAdresse {
  name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
}

function Auswahlkachel({
  aktiv,
  onSelect,
  icon,
  title,
  text,
}: {
  aktiv: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={aktiv}
      className={cn(
        "flex gap-3 rounded-md border p-4 text-left transition-colors",
        aktiv
          ? "border-foreground bg-secondary"
          : "border-border hover:border-foreground/30",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border",
          aktiv ? "border-foreground" : "border-border",
        )}
      >
        {aktiv ? <span className="size-2 rounded-full bg-foreground" /> : null}
      </span>
    </button>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={disabled || pending}>
      {pending ? "Bestellung wird gesendet …" : "Zahlungspflichtig bestellen"}
    </Button>
  );
}

/**
 * Frühester wählbarer Abholtermin: morgen, 08:00 Uhr. Kommissioniert wird
 * nicht in der Minute der Bestellung, und ein Termin von heute Mittag wäre
 * eine Zusage, die der Laden nicht halten kann.
 */
function fruehesterTermin(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function CheckoutForm({
  adresse,
  vatRate,
}: {
  adresse: HinterlegteAdresse;
  /** Steuersatz aus den Firmendaten – nur Anzeige, gerechnet wird in der DB */
  vatRate: number;
}) {
  const { items, ready, total, clear } = useCart();
  const bilder = useCartImages(items);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("shipping");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [abweichend, setAbweichend] = useState(false);
  const [abholung, setAbholung] = useState("");
  const [state, formAction] = useActionState<CheckoutState, FormData>(createOrder, {});
  const router = useRouter();

  const adresseVollstaendig = Boolean(
    adresse.street && adresse.zip && adresse.city,
  );

  /*
   * Zwei Werte, die sich aus der Auswahl ergeben, statt zweier Zustände, die
   * einander per Effekt nachgezogen werden: ohne hinterlegte Anschrift gibt es
   * nur die Eingabe von Hand, und bar oder Karte gibt es nur am Tresen. Als
   * Effekt geschrieben, rendert das Formular nach jedem Umschalten zweimal.
   */
  const abweichendEffektiv = abweichend || !adresseVollstaendig;
  const zahlart: PaymentMethod =
    deliveryMethod === "shipping" ? "transfer" : paymentMethod;

  // Erst nach erfolgreicher Antwort leeren – sonst wäre der Warenkorb bei
  // einem Fehler (z. B. Bestand reicht nicht mehr) weg.
  useEffect(() => {
    if (!state.orderId) return;
    clear();
    router.push(`/orders/${state.orderId}?neu=1`);
  }, [state.orderId, clear, router]);

  if (!ready) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Ihr Warenkorb ist leer.</p>
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

  const betraege = steuer(total, vatRate);
  const versand = deliveryMethod === "shipping";

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <input type="hidden" name="deliveryMethod" value={deliveryMethod} />
      <input type="hidden" name="paymentMethod" value={zahlart} />
      <input
        type="hidden"
        name="differentAddress"
        value={abweichendEffektiv ? "1" : "0"}
      />
      {/*
        Die Eingabe ist Ortszeit ohne Zone; der Server läuft in UTC. Der
        Browser kennt die Zone des Kunden, also rechnet er hier um – sonst
        verschöbe sich jeder Abholtermin um zwei Stunden.
      */}
      <input
        type="hidden"
        name="pickupAt"
        value={abholung ? new Date(abholung).toISOString() : ""}
      />

      <div className="space-y-8">
        <section>
          <h2 className="font-medium">Bestellpositionen</h2>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {items.map((item) => {
              const tier = resolveTier(item.tiers, item.quantity);
              const bild = item.imagePath ? bilder[item.imagePath] : null;
              return (
                <li
                  key={item.productId}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {bild ? (
                      <Image
                        src={bild}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <ImageOff
                        className="absolute inset-0 m-auto size-5 text-muted-foreground/40"
                        aria-hidden
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="code text-xs text-muted-foreground">
                      {item.productSku}
                    </p>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-muted-foreground tabular">
                      {formatQuantity(item.quantity)} ×{" "}
                      {tier ? formatPrice(tier.unit_price) : "–"}
                    </p>
                  </div>

                  <p className="shrink-0 font-semibold tabular">
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

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Auswahlkachel
              aktiv={versand}
              onSelect={() => setDeliveryMethod("shipping")}
              icon={<Package className="size-5" aria-hidden />}
              title="Versand"
              text={
                qualifiesForFreeShipping(total)
                  ? "Kostenfrei ab 100 € netto – erreicht."
                  : "Kosten nach Gewicht und Ziel, Mitteilung mit der Auftragsbestätigung."
              }
            />
            <Auswahlkachel
              aktiv={!versand}
              onSelect={() => setDeliveryMethod("pickup")}
              icon={<Store className="size-5" aria-hidden />}
              title="Selbstabholung"
              text="Abholung im Lager, Termin nach Wunsch oder auf unsere Meldung hin."
            />
          </div>

          {versand ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium">Lieferadresse</p>

              {adresseVollstaendig ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Auswahlkachel
                    aktiv={!abweichendEffektiv}
                    onSelect={() => setAbweichend(false)}
                    icon={<Store className="size-5" aria-hidden />}
                    title="Hinterlegte Adresse"
                    text={[adresse.name, adresse.street, `${adresse.zip} ${adresse.city}`]
                      .filter(Boolean)
                      .join(", ")}
                  />
                  <Auswahlkachel
                    aktiv={abweichendEffektiv}
                    onSelect={() => setAbweichend(true)}
                    icon={<Package className="size-5" aria-hidden />}
                    title="Andere Adresse"
                    text="Einmalig für diese Bestellung, Ihr Konto bleibt unverändert."
                  />
                </div>
              ) : (
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  In Ihrem Konto ist noch keine vollständige Lieferadresse
                  hinterlegt. Bitte tragen Sie sie hier ein.
                </p>
              )}

              {abweichendEffektiv ? (
                <div className="rounded-md border border-border bg-muted/40 p-4">
                  <AddressFields
                    prefix="delivery"
                    required
                    nameLabel="Firma oder Empfänger"
                    nameDefault={adresse.name}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              <Label htmlFor="abholtermin">Wunschtermin für die Abholung</Label>
              <input
                id="abholtermin"
                type="datetime-local"
                value={abholung}
                min={fruehesterTermin()}
                onChange={(event) => setAbholung(event.target.value)}
                className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Freiwillig. Ohne Termin melden wir uns, sobald die Ware
                bereitsteht.
              </p>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-medium">Zahlung</h2>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Auswahlkachel
              aktiv={zahlart === "transfer"}
              onSelect={() => setPaymentMethod("transfer")}
              icon={<Landmark className="size-5" aria-hidden />}
              title="Überweisung"
              text="Rechnung kommt per E-Mail, Bearbeitung nach Zahlungseingang."
            />
            {versand ? null : (
              <>
                <Auswahlkachel
                  aktiv={zahlart === "cash"}
                  onSelect={() => setPaymentMethod("cash")}
                  icon={<Banknote className="size-5" aria-hidden />}
                  title="Bar bei Abholung"
                  text="Zahlung am Tresen, wenn Sie die Ware mitnehmen."
                />
                <Auswahlkachel
                  aktiv={zahlart === "card"}
                  onSelect={() => setPaymentMethod("card")}
                  icon={<CreditCard className="size-5" aria-hidden />}
                  title="Karte bei Abholung"
                  text="EC- oder Kreditkarte am Tresen."
                />
              </>
            )}
          </div>

          {versand ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Bar- und Kartenzahlung gibt es nur bei Selbstabholung.
            </p>
          ) : null}
        </section>

        <section className="space-y-2">
          <Label htmlFor="notes">Anmerkungen</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={4}
            maxLength={2000}
            placeholder="Abweichungen, Rückfragen, Hinweise zur Anlieferung"
          />
        </section>
      </div>

      <aside className="h-fit rounded-md border border-border p-5 lg:sticky lg:top-20">
        <h2 className="font-medium">Zusammenfassung</h2>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Summe netto</dt>
            <dd className="tabular">{formatPrice(betraege.netto)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              zzgl. {betraege.satz.toFixed(0)} % USt.
            </dt>
            <dd className="tabular">{formatPrice(betraege.steuer)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
          <span className="text-sm font-medium">Zu zahlen</span>
          <span className="text-2xl font-semibold tabular">
            {formatPrice(betraege.brutto)}
          </span>
        </div>

        {versand ? (
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

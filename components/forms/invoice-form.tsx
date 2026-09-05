"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCatalogInvoiceOrder,
  createManualInvoice,
  type InvoiceActionState,
} from "@/lib/actions/admin-invoices";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/format";
import { resolveTier } from "@/lib/pricing";
import type { AdminProductRow } from "@/lib/queries/admin";
import type { AppUser } from "@/lib/types";

type Mode = "catalog" | "manual";
type VatRate = "0" | "7" | "19";

interface CatalogRow {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface ManualRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: VatRate;
}

function emptyManualRow(): ManualRow {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPrice: "",
    vatRate: "19",
  };
}

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={disabled || pending}>
      {pending ? "Wird gespeichert …" : label}
    </Button>
  );
}

export function InvoiceForm({
  customers,
  products,
}: {
  customers: AppUser[];
  products: AdminProductRow[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("catalog");
  const [customerId, setCustomerId] = useState<string | null>(null);

  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const [manualRows, setManualRows] = useState<ManualRow[]>([emptyManualRow()]);
  const [notes, setNotes] = useState("");

  const [catalogState, catalogAction] = useActionState<InvoiceActionState, FormData>(
    createCatalogInvoiceOrder,
    {},
  );
  const [manualState, manualAction] = useActionState<InvoiceActionState, FormData>(
    createManualInvoice,
    {},
  );

  const state = mode === "catalog" ? catalogState : manualState;

  useEffect(() => {
    if (!catalogState.orderId) return;
    toast.success("Bestellung angelegt, Rechnung wird verschickt.");
    router.push(`/admin/orders/${catalogState.orderId}`);
  }, [catalogState.orderId, router]);

  useEffect(() => {
    if (!manualState.invoiceId) return;
    toast.success("Rechnung angelegt und verschickt.");
    router.push(`/admin/invoices/${manualState.invoiceId}`);
  }, [manualState.invoiceId, router]);

  const filteredProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase();
    if (!term) return [];
    return products
      .filter((product) =>
        [product.name, product.sku].some((value) =>
          value.toLowerCase().includes(term),
        ),
      )
      .slice(0, 10);
  }, [products, productQuery]);

  function addCatalogRow(productId: string) {
    if (catalogRows.some((row) => row.productId === productId)) {
      setProductQuery("");
      return;
    }
    const product = products.find((item) => item.id === productId);
    const tier = product ? resolveTier(product.variants, 1) : null;
    setCatalogRows((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        productId,
        quantity: "1",
        unitPrice: tier ? String(tier.unit_price) : "",
      },
    ]);
    setProductQuery("");
  }

  const catalogTotal = catalogRows.reduce((sum, row) => {
    return sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
  }, 0);

  const manualNet = manualRows.reduce((sum, row) => {
    return sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
  }, 0);
  const manualVat = manualRows.reduce((sum, row) => {
    const lineNet = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
    return sum + (lineNet * Number(row.vatRate)) / 100;
  }, 0);
  const manualGross = manualNet + manualVat;

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "catalog" ? "default" : "outline"}
          onClick={() => setMode("catalog")}
        >
          Aus Katalog
        </Button>
        <Button
          type="button"
          variant={mode === "manual" ? "default" : "outline"}
          onClick={() => setMode("manual")}
        >
          Freie Rechnung
        </Button>
      </div>

      <div className="max-w-md space-y-2">
        <Label>Kunde</Label>
        <CustomerCombobox
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
        />
      </div>

      {mode === "catalog" ? (
        <form
          action={(formData) => {
            const payload = catalogRows.map((row) => ({
              product_id: row.productId,
              quantity: Number(row.quantity),
              unit_price: row.unitPrice ? Number(row.unitPrice) : undefined,
            }));
            formData.set("customer_id", customerId ?? "");
            formData.set("items", JSON.stringify(payload));
            formData.set("delivery_address", deliveryAddress);
            formData.set(
              "delivery_method",
              deliveryAddress.trim() ? "shipping" : "pickup",
            );
            catalogAction(formData);
          }}
          className="space-y-6"
        >
          <section>
            <Label>Artikel suchen</Label>
            <div className="relative mt-2">
              <Input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Name oder Artikelnummer …"
              />
              {filteredProducts.length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addCatalogRow(product.id)}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="block font-medium">{product.name}</span>
                      <span className="block text-xs text-muted-foreground tabular">
                        {product.sku}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {catalogRows.map((row, index) => {
                const product = products.find((item) => item.id === row.productId);
                return (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-40 flex-1">
                      <p className="text-xs text-muted-foreground tabular">
                        {product?.sku}
                      </p>
                      <p className="font-medium">
                        {product?.name ?? "Unbekannter Artikel"}
                      </p>
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Menge</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        className="tabular"
                        onChange={(event) =>
                          setCatalogRows((current) =>
                            current.map((r, i) =>
                              i === index ? { ...r, quantity: event.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="w-32 space-y-1">
                      <Label className="text-xs">Preis / Stück (€)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.unitPrice}
                        className="tabular"
                        onChange={(event) =>
                          setCatalogRows((current) =>
                            current.map((r, i) =>
                              i === index ? { ...r, unitPrice: event.target.value } : r,
                            ),
                          )
                        }
                      />
                    </div>
                    <p className="min-w-24 pb-2 text-sm text-muted-foreground tabular">
                      {formatPrice(
                        (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0),
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Position entfernen"
                      onClick={() =>
                        setCatalogRows((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {catalogRows.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Noch keine Artikel hinzugefügt.
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="delivery_address">Lieferadresse (optional)</Label>
            <Textarea
              id="delivery_address"
              value={deliveryAddress}
              onChange={(event) => setDeliveryAddress(event.target.value)}
              rows={3}
              placeholder="Leer lassen für Selbstabholung"
            />
          </section>

          <section className="space-y-2">
            <Label htmlFor="notes">Anmerkungen</Label>
            <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
          </section>

          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <span className="text-sm text-muted-foreground">Summe netto</span>
            <span className="text-xl font-semibold tabular">
              {formatPrice(catalogTotal)}
            </span>
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <SubmitButton
            label="Bestellung anlegen"
            disabled={!customerId || catalogRows.length === 0}
          />
        </form>
      ) : (
        <form
          action={(formData) => {
            const payload = manualRows.map((row) => ({
              description: row.description,
              quantity: Number(row.quantity),
              unit_price: Number(row.unitPrice),
              vat_rate: Number(row.vatRate),
            }));
            formData.set("customer_id", customerId ?? "");
            formData.set("items", JSON.stringify(payload));
            formData.set("notes", notes);
            manualAction(formData);
          }}
          className="space-y-6"
        >
          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Positionen</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setManualRows((current) => [...current, emptyManualRow()])
                }
              >
                <Plus className="size-4" /> Position
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {manualRows.map((row, index) => (
                <div
                  key={row.key}
                  className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-48 flex-1 space-y-1">
                    <Label className="text-xs">Beschreibung</Label>
                    <Input
                      value={row.description}
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, description: event.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Menge</Label>
                    <Input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={row.quantity}
                      className="tabular"
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, quantity: event.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label className="text-xs">Preis / Stück (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.unitPrice}
                      className="tabular"
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((r, i) =>
                            i === index ? { ...r, unitPrice: event.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">MwSt.</Label>
                    <select
                      value={row.vatRate}
                      onChange={(event) =>
                        setManualRows((current) =>
                          current.map((r, i) =>
                            i === index
                              ? { ...r, vatRate: event.target.value as VatRate }
                              : r,
                          ),
                        )
                      }
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="19">19 %</option>
                      <option value="7">7 %</option>
                      <option value="0">0 %</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Position entfernen"
                    disabled={manualRows.length === 1}
                    onClick={() =>
                      setManualRows((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="manual_notes">Notiz (erscheint auf der Rechnung)</Label>
            <Textarea
              id="manual_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="z. B. Beratung März 2026"
            />
          </section>

          <div className="space-y-2 rounded-md border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Netto</span>
              <span className="tabular">{formatPrice(manualNet)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">MwSt.</span>
              <span className="tabular">{formatPrice(manualVat)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-medium">Gesamt</span>
              <span className="text-xl font-semibold tabular">
                {formatPrice(manualGross)}
              </span>
            </div>
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <SubmitButton
            label="Rechnung anlegen"
            disabled={
              !customerId ||
              manualRows.some((row) => !row.description.trim() || !row.unitPrice)
            }
          />
        </form>
      )}
    </div>
  );
}

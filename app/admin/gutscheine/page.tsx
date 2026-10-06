import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { VoucherForm } from "@/components/forms/voucher-form";
import { Button } from "@/components/ui/button";
import { deleteVoucher, toggleVoucher } from "@/lib/actions/admin-vouchers";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { getCustomers } from "@/lib/queries/admin";
import { getCategories } from "@/lib/queries/products";
import {
  getMargenArtikel,
  getVoucherRedemptions,
  getVouchers,
  voucherStatus,
  type VoucherStatus,
} from "@/lib/queries/vouchers";
import { gutscheinWert } from "@/lib/rabatt";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gutscheine" };

const STATUS_STIL: Record<VoucherStatus, string> = {
  aktiv: "border-success/30 bg-success/10 text-success",
  geplant: "border-brand/30 bg-brand-soft text-brand",
  abgelaufen: "border-border bg-muted text-muted-foreground",
  aufgebraucht: "border-gold/40 bg-gold-soft text-[#7a4a10]",
  inaktiv: "border-border bg-muted text-muted-foreground",
};

function laufzeit(von: string | null, bis: string | null): string {
  if (!von && !bis) return "unbefristet";
  // valid_until ist der Beginn des Folgetags – angezeigt wird der letzte Tag.
  const bisTag = bis ? formatDate(new Date(new Date(bis).getTime() - 1).toISOString()) : null;
  if (von && bisTag) return `${formatDate(von)} – ${bisTag}`;
  if (von) return `ab ${formatDate(von)}`;
  return `bis ${bisTag}`;
}

export default async function AdminVouchersPage({
  searchParams,
}: PageProps<"/admin/gutscheine">) {
  await requireAdmin();
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;
  const vorgabeKunde = typeof params.kunde === "string" ? params.kunde : null;

  const [vouchers, customers, categories, margen] = await Promise.all([
    getVouchers(),
    getCustomers(),
    getCategories(),
    getMargenArtikel(),
  ]);
  const gruppenName = new Map(categories.map((c) => [c.id, c.name]));
  const editing = vouchers.find((v) => v.id === editId);
  const einloesungen = editing ? await getVoucherRedemptions(editing.id) : [];

  const aktiv = vouchers.filter((v) => voucherStatus(v) === "aktiv").length;
  const gesamt = vouchers.reduce((summe, v) => summe + v.einloesungen, 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Gutscheine</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Aktionscodes für den Shop. Der Kunde gibt den Code beim Bestellen ein,
        der Abzug steht auf Bestellung und Rechnung.
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-lg">
        {[
          ["Gutscheine", vouchers.length],
          ["davon einlösbar", aktiv],
          ["Einlösungen", gesamt],
        ].map(([label, wert]) => (
          <div key={label} className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold tabular">{wert}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          <div className="overflow-x-auto">
            {vouchers.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                Noch keine Gutscheine angelegt.
              </p>
            ) : (
              <table className="w-full min-w-3xl border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Rabatt</th>
                    <th className="py-2 pr-4 font-medium">Laufzeit</th>
                    <th className="py-2 pr-4 text-right font-medium">Eingelöst</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => {
                    const status = voucherStatus(v);
                    return (
                      <tr
                        key={v.id}
                        className={cn(
                          "border-b border-border last:border-0",
                          v.id === editId && "bg-brand-soft/60",
                        )}
                      >
                        <td className="py-3 pr-4">
                          <p className="code font-semibold tracking-wider">{v.code}</p>
                          {v.kunde ? (
                            <Link
                              href={`/admin/customers/${v.kunde.id}`}
                              className="text-xs text-brand hover:underline"
                            >
                              nur {v.kunde.company_name || v.kunde.full_name}
                            </Link>
                          ) : v.description ? (
                            <p className="text-xs text-muted-foreground">{v.description}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium tabular">
                            −{gutscheinWert(v.kind, Number(v.value))}
                          </p>
                          {Number(v.min_order_amount) > 0 ? (
                            <p className="text-xs text-muted-foreground tabular">
                              ab {formatPrice(v.min_order_amount)}
                            </p>
                          ) : null}
                          {(v.category_ids ?? []).length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              nur{" "}
                              {v.category_ids
                                .map((id) => gruppenName.get(id) ?? "gelöschte Warengruppe")
                                .join(", ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 tabular text-muted-foreground">
                          {laufzeit(v.valid_from, v.valid_until)}
                        </td>
                        <td className="py-3 pr-4 text-right tabular">
                          {v.einloesungen}
                          {v.max_redemptions != null ? (
                            <span className="text-muted-foreground"> / {v.max_redemptions}</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                              STATUS_STIL[status],
                            )}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/gutscheine?edit=${v.id}`}>Bearbeiten</Link>
                            </Button>
                            <ConfirmAction
                              action={toggleVoucher}
                              fields={{ id: v.id, is_active: String(!v.is_active) }}
                              title={v.is_active ? "Gutschein deaktivieren?" : "Gutschein aktivieren?"}
                              description={
                                v.is_active
                                  ? `${v.code} kann danach nicht mehr eingelöst werden. Bestehende Bestellungen bleiben unverändert.`
                                  : `${v.code} kann wieder eingelöst werden.`
                              }
                              confirmLabel={v.is_active ? "Deaktivieren" : "Aktivieren"}
                              destructive={v.is_active}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  {v.is_active ? "Deaktivieren" : "Aktivieren"}
                                </Button>
                              }
                            />
                            {v.einloesungen === 0 ? (
                              <ConfirmAction
                                action={deleteVoucher}
                                fields={{ id: v.id }}
                                title="Gutschein löschen?"
                                description={`${v.code} wird endgültig entfernt.`}
                                confirmLabel="Löschen"
                                destructive
                                trigger={
                                  <Button variant="ghost" size="sm" className="text-destructive">
                                    Löschen
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {editing ? (
            <section>
              <h2 className="font-medium">
                Einlösungen von <span className="code">{editing.code}</span>
              </h2>
              {einloesungen.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Noch nicht eingelöst.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-xl border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Bestellung</th>
                        <th className="py-2 pr-4 font-medium">Kunde</th>
                        <th className="py-2 pr-4 font-medium">Datum</th>
                        <th className="py-2 pr-4 text-right font-medium">Abzug</th>
                        <th className="py-2 text-right font-medium">Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {einloesungen.map((e) => (
                        <tr key={e.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4">
                            <Link href={`/admin/orders/${e.id}`} className="font-medium text-brand hover:underline">
                              {e.order_number}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">
                            {e.customer ? (
                              <Link href={`/admin/customers/${e.customer.id}`} className="hover:underline">
                                {e.customer.company_name || e.customer.full_name || "–"}
                              </Link>
                            ) : (
                              "–"
                            )}
                          </td>
                          <td className="py-2 pr-4 tabular text-muted-foreground">
                            {formatDate(e.created_at)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular text-success">
                            −{formatPrice(e.voucher_discount_amount)}
                          </td>
                          <td className="py-2 text-right tabular">{formatPrice(e.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{editing ? "Gutschein bearbeiten" : "Neuer Gutschein"}</h2>
            {editing ? (
              <Link href="/admin/gutscheine" className="text-xs text-muted-foreground hover:text-foreground">
                Abbrechen
              </Link>
            ) : null}
          </div>
          <div className="mt-4">
            <VoucherForm
              key={editing?.id ?? `neu-${vorgabeKunde ?? ""}`}
              voucher={editing}
              customers={customers}
              categories={categories.map(({ id, name }) => ({ id, name }))}
              margen={margen}
              vorgabeKunde={vorgabeKunde}
              zurueck={vorgabeKunde ? `/admin/customers/${vorgabeKunde}` : "/admin/gutscheine"}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

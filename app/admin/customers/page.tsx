import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ResetPasswordButton } from "@/components/admin/reset-password-button";
import { CustomerForm } from "@/components/forms/customer-form";
import { Button } from "@/components/ui/button";
import { toggleCustomerActive } from "@/lib/actions/admin-customers";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getCustomers } from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Kunden" };

export default async function AdminCustomersPage({
  searchParams,
}: PageProps<"/admin/customers">) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;

  const customers = await getCustomers();
  const editing = customers.find((customer) => customer.id === editId);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Kunden</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Zugänge werden ausschließlich hier angelegt – es gibt keine öffentliche
        Registrierung.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-x-auto">
          {customers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              Noch keine Kunden angelegt.
            </p>
          ) : (
            <table className="w-full min-w-3xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Firma</th>
                  <th className="py-2 pr-4 font-medium">Ansprechpartner</th>
                  <th className="py-2 pr-4 font-medium">E-Mail</th>
                  <th className="py-2 pr-4 font-medium">Angelegt</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const isSelf = customer.id === admin.id;
                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {customer.company_name || "–"}
                        {customer.role === "admin" ? (
                          <span className="ml-2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            Admin
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">{customer.full_name || "–"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {customer.email}
                      </td>
                      <td className="py-3 pr-4 tabular text-muted-foreground">
                        {formatDate(customer.created_at)}
                      </td>
                      <td className="py-3 pr-4">
                        {customer.is_active ? (
                          <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            aktiv
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            deaktiviert
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/admin/customers?edit=${customer.id}`}>
                              Bearbeiten
                            </Link>
                          </Button>

                          <ResetPasswordButton
                            customerId={customer.id}
                            email={customer.email}
                          />

                          {isSelf ? null : (
                            <ConfirmAction
                              action={toggleCustomerActive}
                              fields={{
                                id: customer.id,
                                is_active: String(!customer.is_active),
                              }}
                              title={
                                customer.is_active
                                  ? "Kunde deaktivieren?"
                                  : "Kunde aktivieren?"
                              }
                              description={
                                customer.is_active
                                  ? "Der Zugang wird gesperrt. Sortiment und Bestelldaten sind dann nicht mehr abrufbar, die Bestellhistorie bleibt erhalten."
                                  : "Der Zugang wird wieder freigeschaltet."
                              }
                              confirmLabel={
                                customer.is_active ? "Deaktivieren" : "Aktivieren"
                              }
                              destructive={customer.is_active}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  {customer.is_active
                                    ? "Deaktivieren"
                                    : "Aktivieren"}
                                </Button>
                              }
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <h2 className="font-medium">
            {editing ? "Kunde bearbeiten" : "Neuer Kunde"}
          </h2>
          <div className="mt-4">
            <CustomerForm key={editing?.id ?? "neu"} customer={editing} />
          </div>
        </aside>
      </div>
    </div>
  );
}

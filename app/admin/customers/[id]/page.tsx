import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Plus, Ticket } from "lucide-react";
import { ZuordnungListe } from "@/components/admin/zuordnung-liste";
import { StartPasswordBox } from "@/components/admin/start-password-box";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { ResetPasswordButton } from "@/components/admin/reset-password-button";
import { SendVerificationButton } from "@/components/admin/send-verification-button";
import { ConditionForm } from "@/components/forms/condition-form";
import { CustomerForm } from "@/components/forms/customer-form";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { toggleCustomerActive } from "@/lib/actions/admin-customers";
import { requireAdmin } from "@/lib/auth";
import { profilLuecken } from "@/lib/profil";
import { getZuordenbares } from "@/lib/queries/zuordnung";
import { readStartPassword } from "@/lib/start-password";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatPrice } from "@/lib/format";
import { getKundenDetail, voucherStatus } from "@/lib/queries/vouchers";
import { gutscheinWert, satzText } from "@/lib/rabatt";

export const metadata: Metadata = { title: "Kunde" };

/**
 * Kundenakte: Stammdaten, Sonderkondition, persönliche Gutscheine und
 * Bestellungen auf einer Seite. Die Liste unter /admin/customers ist zum
 * Finden da, hier wird der Kunde betreut.
 */
export default async function AdminCustomerPage({
  params,
}: PageProps<"/admin/customers/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const detail = await getKundenDetail(id);
  if (!detail) notFound();

  const { kunde, kondition, bestellungen, gutscheine } = detail;
  const name = kunde.company_name || kunde.full_name || kunde.email;
  const umsatz = bestellungen
    .filter((b) => b.status !== "cancelled")
    .reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const rabattGesamt = bestellungen.reduce(
    (s, b) =>
      s + (Number(b.customer_discount_amount) || 0) + (Number(b.voucher_discount_amount) || 0),
    0,
  );
  const satz = Number(kondition?.discount_percent ?? 0);

  // Hat der Kunde sein Startpasswort noch nicht ersetzt? Das Flag steht in
  // app_metadata des Auth-Kontos, nicht im Profil.
  const { data: authKonto } = await createAdminClient().auth.admin.getUserById(kunde.id);
  const startpasswortOffen = authKonto?.user?.app_metadata?.must_change_password === true;
  const startpasswort = startpasswortOffen ? await readStartPassword(kunde.id) : null;
  const zuordenbar = await getZuordenbares();
  const luecken = kunde.role === "customer" ? profilLuecken(kunde) : [];

  return (
    <div>
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Kunden
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            {!kunde.verified_at && !kunde.is_active ? (
              <span className="rounded-md border border-gold/40 bg-gold-soft px-2 py-0.5 text-xs font-medium text-[#7a4a10]">
                E-Mail unbestätigt
              </span>
            ) : kunde.is_active ? (
              <span className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                aktiv
              </span>
            ) : (
              <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                deaktiviert
              </span>
            )}
            {startpasswortOffen ? (
              <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                Passwort noch nicht geändert
              </span>
            ) : null}
            {luecken.length > 0 ? (
              <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Angaben unvollständig
              </span>
            ) : null}
            {satz > 0 ? (
              <span className="rounded-md border border-gold/40 bg-gold-soft px-2 py-0.5 text-xs font-semibold text-[#7a4a10]">
                Sonderkondition −{satzText(satz)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {kunde.customer_number ? (
              <span className="tabular font-medium text-foreground">{kunde.customer_number}</span>
            ) : null}
            {kunde.customer_number ? " · " : null}
            {kunde.full_name && kunde.company_name ? `${kunde.full_name} · ` : null}
            <a href={`mailto:${kunde.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Mail className="size-3.5" aria-hidden />
              {kunde.email}
            </a>
            {" · seit "}
            {formatDate(kunde.created_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!kunde.verified_at && !kunde.is_active ? (
            <SendVerificationButton customerId={kunde.id} erneut={false} />
          ) : null}
          <ResetPasswordButton customerId={kunde.id} email={kunde.email} />
          {kunde.id === admin.id ? null : (
            <ConfirmAction
              action={toggleCustomerActive}
              fields={{ id: kunde.id, is_active: String(!kunde.is_active) }}
              title={kunde.is_active ? "Kunde deaktivieren?" : "Kunde aktivieren?"}
              description={
                kunde.is_active
                  ? "Der Zugang wird gesperrt. Die Bestellhistorie bleibt erhalten."
                  : "Der Zugang wird wieder freigeschaltet."
              }
              confirmLabel={kunde.is_active ? "Deaktivieren" : "Aktivieren"}
              destructive={kunde.is_active}
              trigger={
                <Button variant="outline" size="sm">
                  {kunde.is_active ? "Deaktivieren" : "Aktivieren"}
                </Button>
              }
            />
          )}
        </div>
      </div>

      {startpasswortOffen ? (
        <div className="mt-6 max-w-xl">
          {startpasswort ? (
            <StartPasswordBox
              title="Startpasswort – der Kunde hat noch kein eigenes vergeben"
              password={startpasswort}
              email={kunde.email}
              dauerhaft
            />
          ) : (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
              <span className="font-medium text-warning">
                Der Kunde hat noch kein eigenes Passwort vergeben.
              </span>{" "}
              Das Startpasswort ist nicht gespeichert (das Konto stammt aus der
              Zeit davor). Über „Passwort“ oben erzeugst du ein neues – es bleibt
              danach hier sichtbar.
            </p>
          )}
        </div>
      ) : null}

      {luecken.length > 0 ? (
        <p className="mt-4 max-w-xl text-sm text-muted-foreground">
          Es fehlen noch: {luecken.join(", ")}. Der Kunde ergänzt sie nach dem
          ersten Login und muss es vor der ersten Bestellung getan haben.
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Bestellungen", String(bestellungen.length)],
          ["Umsatz netto", formatPrice(umsatz)],
          ["Letzte Bestellung", bestellungen[0] ? formatDate(bestellungen[0].created_at) : "–"],
          ["Gewährte Rabatte", formatPrice(rabattGesamt)],
        ].map(([label, wert]) => (
          <div key={label} className="rounded-md border border-border px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular">{wert}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          <section className="rounded-md border border-border p-5">
            <h2 className="font-medium">Sonderkondition</h2>
            <div className="mt-4">
              <ConditionForm customerId={kunde.id} condition={kondition} />
            </div>
          </section>

          <section className="rounded-md border border-border p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-medium">
                <Ticket className="size-4 text-muted-foreground" aria-hidden />
                Persönliche Gutscheine
              </h2>
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/gutscheine?kunde=${kunde.id}`}>
                  <Plus className="size-4" aria-hidden />
                  Gutschein für diesen Kunden
                </Link>
              </Button>
            </div>
            {gutscheine.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Keine Gutscheine nur für diesen Kunden. Allgemeine Codes kann er
                trotzdem einlösen.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {gutscheine.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link
                      href={`/admin/gutscheine?edit=${g.id}`}
                      className="code font-semibold tracking-wider hover:underline"
                    >
                      {g.code}
                    </Link>
                    <span className="tabular">−{gutscheinWert(g.kind, Number(g.value))}</span>
                    <span className="text-muted-foreground tabular">
                      {g.einloesungen}× eingelöst
                    </span>
                    <span className="text-xs text-muted-foreground">{voucherStatus(g)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-medium">Bestellungen</h2>
            {bestellungen.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Noch keine Bestellungen.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-xl border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Nummer</th>
                      <th className="py-2 pr-4 font-medium">Datum</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Rabatt</th>
                      <th className="py-2 text-right font-medium">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestellungen.map((b) => {
                      const abzug =
                        (Number(b.customer_discount_amount) || 0) +
                        (Number(b.voucher_discount_amount) || 0);
                      return (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4">
                            <Link
                              href={`/admin/orders/${b.id}`}
                              className="font-medium text-brand hover:underline"
                            >
                              {b.order_number}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 tabular text-muted-foreground">
                            {formatDate(b.created_at)}
                          </td>
                          <td className="py-2 pr-4">
                            <OrderStatusBadge status={b.status} />
                          </td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">
                            {abzug > 0 ? (
                              <span className="tabular text-success">
                                −{formatPrice(abzug)}
                                {b.voucher_code ? (
                                  <span className="code ml-1 text-muted-foreground">
                                    {b.voucher_code}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              "–"
                            )}
                          </td>
                          <td className="py-2 text-right font-medium tabular">
                            {formatPrice(b.total_amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {kunde.role === "customer" &&
          (zuordenbar.rechnungen.length > 0 || zuordenbar.verkaeufe.length > 0) ? (
            <details className="rounded-md border border-border p-5">
              <summary className="cursor-pointer font-medium">
                Alte Rechnungen und Kassenverkäufe zuordnen
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular">
                  {zuordenbar.rechnungen.length + zuordenbar.verkaeufe.length} offen
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                Belege aus der Zeit vor dem Bestellablauf. Wer sie hier einem Kunden
                zuordnet, bekommt dafür eine Bestellung (Status „geliefert“, Datum
                des Belegs) und sieht sie in seinem Konto.
              </p>
              <div className="mt-4">
                <ZuordnungListe
                  kundeId={kunde.id}
                  kundeName={name}
                  daten={zuordenbar}
                />
              </div>
            </details>
          ) : null}
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <h2 className="font-medium">Stammdaten</h2>
          <div className="mt-4">
            <CustomerForm customer={kunde} zurueck={`/admin/customers/${kunde.id}`} />
          </div>
        </aside>
      </div>
    </div>
  );
}

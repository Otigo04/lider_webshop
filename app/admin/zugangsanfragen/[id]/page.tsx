import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AccessRequestStatusSelect } from "@/components/admin/access-request-status-select";
import { Button } from "@/components/ui/button";
import { composeAddress } from "@/lib/address";
import { formatDate } from "@/lib/format";
import { getAccessRequest } from "@/lib/queries/admin";

export async function generateMetadata({
  params,
}: PageProps<"/admin/zugangsanfragen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const request = await getAccessRequest(id);
  return { title: request ? request.company_name : "Zugangsanfrage" };
}

export default async function AdminAccessRequestDetailPage({
  params,
}: PageProps<"/admin/zugangsanfragen/[id]">) {
  const { id } = await params;
  const request = await getAccessRequest(id);
  if (!request) notFound();

  return (
    <div>
      <Link
        href="/admin/zugangsanfragen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Zugangsanfragen
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {request.company_name}
        </h1>
        <AccessRequestStatusSelect requestId={request.id} status={request.status} />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Eingegangen</dt>
          <dd className="mt-1 tabular">{formatDate(request.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ansprechpartner</dt>
          <dd className="mt-1">{request.contact_name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-Mail</dt>
          <dd className="mt-1 break-all">{request.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefon</dt>
          <dd className="mt-1">{request.phone || "–"}</dd>
        </div>
      </dl>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="font-medium">Rechnungsadresse</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {composeAddress({
              street: request.billing_street,
              zip: request.billing_zip,
              city: request.billing_city,
              country: request.billing_country,
            })}
          </p>
        </section>
        <section>
          <h2 className="font-medium">Versandadresse</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {composeAddress({
              street: request.shipping_street,
              zip: request.shipping_zip,
              city: request.shipping_city,
              country: request.shipping_country,
            })}
          </p>
        </section>
      </div>

      {request.message ? (
        <section className="mt-8">
          <h2 className="font-medium">Nachricht</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
            {request.message}
          </p>
        </section>
      ) : null}

      <div className="mt-10 rounded-md border border-border p-5">
        <h2 className="font-medium">Zugang anlegen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Legt hier keinen Kunden automatisch an – öffnen Sie „Kunden“ und
          tragen Sie E-Mail, Ansprechpartner und Firma aus dieser Anfrage
          ein.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/customers">Zu den Kunden</Link>
        </Button>
      </div>
    </div>
  );
}

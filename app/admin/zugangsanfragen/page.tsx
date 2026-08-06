import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { getAccessRequests } from "@/lib/queries/admin";
import {
  ACCESS_REQUEST_STATUS_LABELS,
  type AccessRequestStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Zugangsanfragen" };

function isStatus(value: string): value is AccessRequestStatus {
  return value in ACCESS_REQUEST_STATUS_LABELS;
}

export default async function AdminAccessRequestsPage({
  searchParams,
}: PageProps<"/admin/zugangsanfragen">) {
  const params = await searchParams;
  const raw = typeof params.status === "string" ? params.status : "";
  const status = isStatus(raw) ? raw : undefined;

  const requests = await getAccessRequests(status);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Zugangsanfragen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Anfragen von der Landingpage. Zugänge werden weiterhin nur unter
        „Kunden“ manuell angelegt.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {(["alle", ...Object.keys(ACCESS_REQUEST_STATUS_LABELS)] as const).map(
          (value) => {
            const active =
              value === "alle" ? status === undefined : status === value;
            return (
              <Link
                key={value}
                href={
                  value === "alle"
                    ? "/admin/zugangsanfragen"
                    : `/admin/zugangsanfragen?status=${value}`
                }
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {value === "alle"
                  ? "Alle"
                  : ACCESS_REQUEST_STATUS_LABELS[value as AccessRequestStatus]}
              </Link>
            );
          },
        )}
      </nav>

      {requests.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Keine Zugangsanfragen in dieser Auswahl.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Firma</th>
                <th className="py-2 pr-4 font-medium">Ansprechpartner</th>
                <th className="py-2 pr-4 font-medium">E-Mail</th>
                <th className="py-2 pr-4 font-medium">Eingegangen</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4 font-medium">{request.company_name}</td>
                  <td className="py-3 pr-4">{request.contact_name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{request.email}</td>
                  <td className="py-3 pr-4 tabular text-muted-foreground">
                    {formatDate(request.created_at)}
                  </td>
                  <td className="py-3 pr-4">
                    {ACCESS_REQUEST_STATUS_LABELS[request.status]}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/admin/zugangsanfragen/${request.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Ansehen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

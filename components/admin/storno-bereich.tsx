import { ConfirmAction } from "@/components/admin/confirm-action";
import { StornoButton } from "@/components/admin/storno-button";
import { Button } from "@/components/ui/button";
import { stornoPdfNeu } from "@/lib/actions/storno";
import { formatDate } from "@/lib/format";
import { getInvoiceUrl } from "@/lib/storage";
import type { Invoice } from "@/lib/types";

/**
 * Storno einer Rechnung: vor der Stornierung der Knopf, danach die Angaben zur
 * Stornorechnung mit ihrem PDF. Für Kassen-Rechnungsseite und Bestellseite.
 */
type Rechnung = Pick<
  Invoice,
  | "id"
  | "invoice_number"
  | "status"
  | "order_id"
  | "storno_number"
  | "cancelled_at"
  | "storno_reason"
  | "storno_file_path"
>;

export async function StornoBereich({ invoice }: { invoice: Rechnung }) {
  if (invoice.status !== "cancelled") {
    return (
      <StornoButton
        invoiceId={invoice.id}
        nummer={invoice.invoice_number}
        bezahlt={invoice.status === "paid"}
        mitBestellung={invoice.order_id !== null}
      />
    );
  }

  const url = await getInvoiceUrl(invoice.storno_file_path);
  return (
    <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
      <p className="font-medium">
        Storniert am {invoice.cancelled_at ? formatDate(invoice.cancelled_at) : "–"} ·
        Stornorechnung <span className="code">{invoice.storno_number}</span>
      </p>
      {invoice.storno_reason ? (
        <p className="mt-1 text-muted-foreground">Grund: {invoice.storno_reason}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:no-underline"
          >
            Stornorechnung (PDF)
          </a>
        ) : (
          <ConfirmAction
            action={stornoPdfNeu}
            fields={{ invoice_id: invoice.id }}
            title="PDF der Stornorechnung erzeugen?"
            description="Die Stornierung steht schon, nur das PDF fehlt. Es wird jetzt gezeichnet, ohne Mail."
            confirmLabel="PDF erzeugen"
            trigger={
              <Button type="button" variant="outline" size="sm">
                PDF erzeugen
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

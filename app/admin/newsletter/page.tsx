import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { NewsletterKopieButton } from "@/components/admin/newsletter-kopie-button";
import { Button } from "@/components/ui/button";
import { createNewsletter, deleteNewsletter } from "@/lib/actions/newsletter";
import { formatDate } from "@/lib/format";
import { getAbonnenten, getNewsletters, type NewsletterZeile } from "@/lib/queries/newsletter";

export const metadata: Metadata = { title: "Newsletter" };

const STATUS: Record<NewsletterZeile["status"], { text: string; klasse: string }> = {
  draft: { text: "Entwurf", klasse: "border-border bg-muted text-muted-foreground" },
  sending: { text: "Versand offen", klasse: "border-warning/40 bg-warning/10 text-warning" },
  sent: { text: "Verschickt", klasse: "border-success/40 bg-success/10 text-success" },
};

/**
 * Newsletter: Entwürfe und verschickte Ausgaben, dazu wer abonniert hat.
 * Abonnieren kann nur der Kunde selbst (Konto, Registrierung) – hier wird
 * niemand eingetragen, die Einwilligung muss vom Kunden kommen.
 */
export default async function NewsletterPage() {
  const [{ liste, migrationFehlt }, abo] = await Promise.all([getNewsletters(), getAbonnenten()]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {abo.abonnenten.length} von {abo.kunden} Kunden haben ihn abonniert.
          </p>
        </div>
        <form action={createNewsletter}>
          <Button type="submit" disabled={migrationFehlt}>
            <Plus className="size-4" aria-hidden /> Neuer Newsletter
          </Button>
        </form>
      </div>

      {migrationFehlt || abo.migrationFehlt ? (
        <p className="mt-6 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Für den Newsletter fehlt noch die Datenbankänderung 065 (
          <code className="code">supabase/migrations/065_newsletter.sql</code>).
        </p>
      ) : null}

      {liste.length === 0 && !migrationFehlt ? (
        <p className="mt-8 rounded-lg border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
          Noch kein Newsletter. „Neuer Newsletter“ legt einen Entwurf mit
          Bausteinen an, die du anpasst.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Betreff</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 text-right font-medium">Empfänger</th>
                <th className="py-2 pr-3 font-medium">Datum</th>
                <th className="py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {liste.map((n) => {
                const s = STATUS[n.status];
                return (
                  <tr key={n.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3">
                      <Link href={`/admin/newsletter/${n.id}`} className="font-medium hover:underline">
                        {n.betreff}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${s.klasse}`}>{s.text}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular text-muted-foreground">
                      {n.status === "draft" ? "–" : n.gesendet}
                      {n.fehlgeschlagen > 0 ? (
                        <span className="ml-1 text-destructive">· {n.fehlgeschlagen} Fehler</span>
                      ) : null}
                      {n.offen > 0 ? <span className="ml-1 text-warning">· {n.offen} offen</span> : null}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular">
                      {formatDate(n.gesendetAm ?? n.erstellt)}
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1">
                        <NewsletterKopieButton id={n.id} />
                        {n.status === "draft" ? (
                          <ConfirmAction
                            action={deleteNewsletter}
                            fields={{ id: n.id }}
                            title="Entwurf löschen?"
                            description={`„${n.betreff}“ wird gelöscht.`}
                            confirmLabel="Löschen"
                            destructive
                            trigger={
                              <Button variant="ghost" size="icon" title="Entwurf löschen" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="size-4" aria-hidden />
                                <span className="sr-only">Entwurf löschen</span>
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
        </div>
      )}

      {abo.abonnenten.length > 0 ? (
        <details className="mt-10 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Abonnenten <span className="font-normal text-muted-foreground tabular">· {abo.abonnenten.length}</span>
          </summary>
          <ul className="mt-3 divide-y divide-border text-sm">
            {abo.abonnenten.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-1.5">
                <Link href={`/admin/customers/${a.id}`} className="font-medium hover:underline">
                  {a.name}
                </Link>
                <span className="text-muted-foreground">{a.email}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular">
                  seit {a.seit ? formatDate(a.seit) : "–"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordneKassenverkaufZu, ordneRechnungZu } from "@/lib/actions/zuordnung";
import { formatDate, formatPrice } from "@/lib/format";
import type { Zuordenbares } from "@/lib/queries/zuordnung";

/**
 * Liste der Belege, die noch keiner Bestellung zugeordnet sind – mit einem
 * Knopf je Zeile. Gefiltert wird im Browser nach Nummer, Betrag, Datum und
 * Bezeichnung: es sind höchstens ein paar hundert Zeilen.
 */
export function ZuordnungListe({
  kundeId,
  kundeName,
  daten,
}: {
  kundeId: string;
  kundeName: string;
  daten: Zuordenbares;
}) {
  const [suche, setSuche] = useState("");
  const wort = suche.trim().toLowerCase();

  const passt = (...felder: (string | number | null)[]) =>
    wort === "" ||
    felder.some((f) => f !== null && String(f).toLowerCase().includes(wort));

  const rechnungen = useMemo(
    () =>
      daten.rechnungen.filter((r) =>
        passt(r.nummer, r.kunde, r.brutto === null ? null : formatPrice(r.brutto), formatDate(r.datum)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daten.rechnungen, wort],
  );
  const verkaeufe = useMemo(
    () =>
      daten.verkaeufe.filter((v) =>
        passt(v.beleg, v.bezeichnung, formatPrice(v.brutto), formatDate(v.datum)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daten.verkaeufe, wort],
  );

  return (
    <div className="space-y-6">
      <Input
        value={suche}
        onChange={(event) => setSuche(event.target.value)}
        placeholder="Nummer, Betrag, Datum oder Bezeichnung"
        aria-label="Belege durchsuchen"
        className="max-w-sm"
      />

      <section>
        <h3 className="text-sm font-medium">
          Freie Rechnungen{" "}
          <span className="font-normal text-muted-foreground tabular">· {rechnungen.length}</span>
        </h3>
        {rechnungen.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Keine offenen freien Rechnungen.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
            {rechnungen.map((r) => {
              const fremd = r.kundeId !== kundeId;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span className="code font-medium">{r.nummer}</span>
                  <span className="text-muted-foreground tabular">{formatDate(r.datum)}</span>
                  <span className="tabular">{r.brutto === null ? "–" : formatPrice(r.brutto)}</span>
                  <span className={fremd ? "text-warning" : "text-muted-foreground"}>
                    {fremd ? `lautet auf: ${r.kunde}` : "lautet schon auf diesen Kunden"}
                  </span>
                  <span className="ml-auto">
                    <ConfirmAction
                      action={ordneRechnungZu}
                      fields={{ invoice_id: r.id, customer_id: kundeId }}
                      title={`Rechnung ${r.nummer} zuordnen?`}
                      description={`Es entsteht eine Bestellung für ${kundeName} mit den Positionen der Rechnung. Rechnungsnummer und PDF bleiben unverändert.${
                        fremd
                          ? ` Achtung: Die Rechnung lautet bisher auf ${r.kunde}, das PDF zeigt weiter diesen Empfänger.`
                          : ""
                      }`}
                      confirmLabel="Zuordnen"
                      trigger={
                        <Button variant="outline" size="sm">
                          Zuordnen
                        </Button>
                      }
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium">
          Kassenverkäufe{" "}
          <span className="font-normal text-muted-foreground tabular">· {verkaeufe.length}</span>
        </h3>
        {daten.migrationFehlt ? (
          <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Für Kassenverkäufe fehlt noch die Datenbankänderung 063.
          </p>
        ) : verkaeufe.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Keine offenen Kassenverkäufe.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
            {verkaeufe.map((v) => {
              const fremd = v.kundeId !== null && v.kundeId !== kundeId;
              return (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                  <span className="code font-medium">{v.beleg}</span>
                  <span className="text-muted-foreground tabular">{formatDate(v.datum)}</span>
                  <span className="tabular">{formatPrice(v.brutto)}</span>
                  <span className="text-muted-foreground">{v.zahlart}</span>
                  {v.bezeichnung ? (
                    <span className="text-muted-foreground">{v.bezeichnung}</span>
                  ) : null}
                  <span className="ml-auto">
                    {fremd ? (
                      <span className="text-xs text-muted-foreground">gehört zu anderem Kunden</span>
                    ) : (
                      <ConfirmAction
                        action={ordneKassenverkaufZu}
                        fields={{ sale_id: v.id, customer_id: kundeId }}
                        title={`Verkauf ${v.beleg} zuordnen?`}
                        description={`Es entsteht eine Bestellung für ${kundeName} mit den Positionen des Verkaufs (netto). Der Beleg und die Kasse bleiben unverändert, gebucht wird nichts.`}
                        confirmLabel="Zuordnen"
                        trigger={
                          <Button variant="outline" size="sm">
                            Zuordnen
                          </Button>
                        }
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

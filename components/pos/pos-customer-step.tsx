"use client";

import { useState } from "react";
import { ArrowRight, ScanBarcode, UserPlus, UserRound, Users } from "lucide-react";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/lib/types";

export interface PosCustomerChoice {
  customerId: string | null;
  /** Beschriftung auf dem Bon – bei Laufkundschaft der einzige Hinweis */
  label: string;
}

type Modus = "bestand" | "neu" | "anonym";

/**
 * Erster Schritt an der Kasse: für wen wird kassiert?
 *
 * Drei Wege, weil der Laden drei Fälle kennt: ein Händler mit Konto (Bon läuft
 * auf sein Kundenkonto und taucht in seinem Portal auf), ein Kunde ohne Konto,
 * der eins bekommen soll, und Laufkundschaft, die einfach zahlt.
 *
 * Der dritte Weg ist der häufigste und steht deshalb nicht am Ende versteckt,
 * sondern gleichberechtigt daneben.
 */
export function PosCustomerStep({
  customers,
  onWeiter,
}: {
  customers: AppUser[];
  onWeiter: (auswahl: PosCustomerChoice) => void;
}) {
  const [modus, setModus] = useState<Modus | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [bezeichnung, setBezeichnung] = useState("");

  const gewaehlt = customers.find((customer) => customer.id === customerId) ?? null;

  function bestaetigen() {
    if (modus === "anonym") {
      onWeiter({
        customerId: null,
        label: bezeichnung.trim() || "Barverkauf",
      });
      return;
    }
    if (!gewaehlt) return;
    onWeiter({
      customerId: gewaehlt.id,
      label: gewaehlt.company_name || gewaehlt.full_name || gewaehlt.email,
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Kasse</h1>
      <p className="mt-1 text-muted-foreground">
        Für wen wird kassiert? Die Auswahl steht auf dem Beleg und entscheidet,
        ob der Verkauf im Kundenkonto auftaucht.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Auswahlkachel
          aktiv={modus === "bestand"}
          onClick={() => setModus("bestand")}
          icon={Users}
          titel="Bestandskunde"
          text="Konto vorhanden – Bon läuft auf den Kunden."
        />
        <Auswahlkachel
          aktiv={modus === "neu"}
          onClick={() => setModus("neu")}
          icon={UserPlus}
          titel="Neuer Kunde"
          text="Konto jetzt anlegen, Startpasswort wird angezeigt."
        />
        <Auswahlkachel
          aktiv={modus === "anonym"}
          onClick={() => setModus("anonym")}
          icon={UserRound}
          titel="Ohne Anmeldung"
          text="Laufkundschaft, nur Beleg – kein Konto."
        />
      </div>

      {modus === "bestand" || modus === "neu" ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-5">
          <Label className="mb-2 block">
            {modus === "neu"
              ? "Kunde anlegen und auswählen"
              : "Kunde suchen"}
          </Label>
          {/* Dieselbe Kundensuche wie bei der Rechnungserstellung – sie bringt
              die Schnellanlage über "+ Neuer Kunde" schon mit. */}
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
          />
          {modus === "neu" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Über „+ Neuer Kunde“ legen Sie das Konto an. Danach steht es hier
              in der Liste und lässt sich auswählen.
            </p>
          ) : null}
        </div>
      ) : null}

      {modus === "anonym" ? (
        <div className="mt-8 rounded-lg border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="pos-label">Bezeichnung auf dem Beleg</Label>
            <Input
              id="pos-label"
              value={bezeichnung}
              maxLength={160}
              placeholder="Barverkauf"
              onChange={(event) => setBezeichnung(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Optional. Leer bleibt „Barverkauf“.
            </p>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="mt-8 w-full sm:w-auto"
        disabled={modus === null || (modus !== "anonym" && !gewaehlt)}
        onClick={bestaetigen}
      >
        <ScanBarcode className="size-4" aria-hidden />
        Kasse öffnen
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function Auswahlkachel({
  aktiv,
  onClick,
  icon: Icon,
  titel,
  text,
}: {
  aktiv: boolean;
  onClick: () => void;
  icon: typeof Users;
  titel: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={cn(
        "rounded-lg border-2 p-4 text-left transition-colors",
        aktiv
          ? "border-brand bg-brand-soft"
          : "border-border bg-card hover:border-brand/40 hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-md",
          aktiv ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="mt-3 block font-semibold">{titel}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
    </button>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, ScanBarcode, UserPlus, UserRound, Users } from "lucide-react";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AppUser, PosPriceMode } from "@/lib/types";

export interface PosCustomerChoice {
  customerId: string | null;
  /** Beschriftung auf dem Bon – bei Laufkundschaft der einzige Hinweis */
  label: string;
  /** Welche Preisliste der Bon benutzt – folgt direkt aus der Kundenwahl */
  priceMode: PosPriceMode;
}

type Modus = "bestand" | "neu" | "privat";

/**
 * Erster Schritt an der Kasse: für wen wird kassiert?
 *
 * Drei Wege, weil der Laden drei Fälle kennt: ein Händler mit Konto (Bon läuft
 * auf sein Kundenkonto und taucht in seinem Portal auf), ein Kunde ohne Konto,
 * der eins bekommen soll, und Privatkundschaft, die einfach zahlt.
 *
 * Die Wahl entscheidet zugleich über die Preisliste: ein Kundenkonto ist ein
 * Händler und bekommt die Staffelpreise, Privatkundschaft den Ladenpreis. Das
 * ist keine zusätzliche Einstellung, sondern hängt an derselben Frage – zwei
 * Schalter dafür wären zwei Gelegenheiten, sich zu vertun.
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
    if (modus === "privat") {
      onWeiter({
        customerId: null,
        label: bezeichnung.trim() || "Barverkauf",
        priceMode: "retail",
      });
      return;
    }
    if (!gewaehlt) return;
    onWeiter({
      customerId: gewaehlt.id,
      label: gewaehlt.company_name || gewaehlt.full_name || gewaehlt.email,
      priceMode: "wholesale",
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Kasse</h1>
      <p className="mt-1 text-muted-foreground">
        Für wen wird kassiert? Die Auswahl steht auf dem Beleg, entscheidet über
        die Preisliste und darüber, ob der Verkauf im Kundenkonto auftaucht.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Auswahlkachel
          aktiv={modus === "bestand"}
          onClick={() => setModus("bestand")}
          icon={Users}
          titel="Händler mit Konto"
          text="Bon läuft auf den Kunden."
          preis="Großhandelspreise"
        />
        <Auswahlkachel
          aktiv={modus === "neu"}
          onClick={() => setModus("neu")}
          icon={UserPlus}
          titel="Neuer Händler"
          text="Konto jetzt anlegen, Startpasswort wird angezeigt."
          preis="Großhandelspreise"
        />
        <Auswahlkachel
          aktiv={modus === "privat"}
          onClick={() => setModus("privat")}
          icon={UserRound}
          titel="Privatkunde"
          text="Laufkundschaft, nur Beleg – kein Konto."
          preis="Einzelhandelspreise"
          ton="gold"
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

      {modus === "privat" ? (
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
        disabled={modus === null || (modus !== "privat" && !gewaehlt)}
        onClick={bestaetigen}
      >
        <ScanBarcode className="size-4" aria-hidden />
        Kasse öffnen
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Die Preiszeile steht bewusst auf der Kachel und nicht im Kleingedruckten:
 * an welchem Preis kassiert wird, ist die Folge dieser Wahl und muss vor dem
 * Klick sichtbar sein, nicht danach.
 */
function Auswahlkachel({
  aktiv,
  onClick,
  icon: Icon,
  titel,
  text,
  preis,
  ton = "brand",
}: {
  aktiv: boolean;
  onClick: () => void;
  icon: typeof Users;
  titel: string;
  text: string;
  preis: string;
  ton?: "brand" | "gold";
}) {
  const gold = ton === "gold";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktiv}
      className={cn(
        "rounded-lg border-2 p-4 text-left transition-all duration-200",
        aktiv
          ? gold
            ? "border-gold bg-gold-soft shadow-sm"
            : "border-brand bg-brand-soft shadow-sm"
          : gold
            ? "border-border bg-card hover:-translate-y-0.5 hover:border-gold/50 hover:bg-gold-soft/40"
            : "border-border bg-card hover:-translate-y-0.5 hover:border-brand/40 hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-md transition-colors",
          aktiv
            ? gold
              ? "bg-gold text-gold-foreground"
              : "bg-brand text-brand-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="mt-3 block font-semibold">{titel}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
      <span
        className={cn(
          "eyebrow mt-3 inline-block rounded px-1.5 py-0.5",
          gold ? "bg-gold text-gold-foreground" : "bg-brand text-brand-foreground",
        )}
      >
        {preis}
      </span>
    </button>
  );
}

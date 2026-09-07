"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Straße, PLZ, Ort, Land als Feldgruppe. Drei Formulare fragen dieselbe
 * Anschrift ab – Konto, Registrierung und Kasse –, und sie müssen dieselben
 * Feldnamen schicken, weil dieselben Zod-Schemata sie lesen. Der `prefix`
 * bestimmt die Namen (`billing_street`, `shipping_zip`, `delivery_city` …).
 *
 * `autoComplete` ist bewusst gesetzt: eine Anschrift, die der Browser
 * ausfüllen kann, tippt niemand ab.
 */
export interface AddressDefaults {
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
}

export function AddressFields({
  prefix,
  defaults,
  required = false,
  /** Zusätzliches Namensfeld über der Straße – für abweichende Empfänger */
  nameLabel,
  nameDefault,
}: {
  prefix: "billing" | "shipping" | "delivery";
  defaults?: AddressDefaults;
  required?: boolean;
  nameLabel?: string;
  nameDefault?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
      {nameLabel ? (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}_name`}>{nameLabel}</Label>
          <Input
            id={`${prefix}_name`}
            name={`${prefix}_name`}
            defaultValue={nameDefault ?? ""}
            autoComplete="organization"
            required={required}
            maxLength={160}
          />
        </div>
      ) : null}

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_street`}>Straße und Hausnummer</Label>
        <Input
          id={`${prefix}_street`}
          name={`${prefix}_street`}
          defaultValue={defaults?.street ?? ""}
          autoComplete="street-address"
          required={required}
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${prefix}_zip`}>PLZ</Label>
        <Input
          id={`${prefix}_zip`}
          name={`${prefix}_zip`}
          defaultValue={defaults?.zip ?? ""}
          autoComplete="postal-code"
          required={required}
          maxLength={20}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${prefix}_city`}>Ort</Label>
        <Input
          id={`${prefix}_city`}
          name={`${prefix}_city`}
          defaultValue={defaults?.city ?? ""}
          autoComplete="address-level2"
          required={required}
          maxLength={120}
        />
      </div>

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${prefix}_country`}>Land</Label>
        <Input
          id={`${prefix}_country`}
          name={`${prefix}_country`}
          defaultValue={defaults?.country ?? "Deutschland"}
          autoComplete="country-name"
          required={required}
          maxLength={80}
        />
      </div>
    </div>
  );
}

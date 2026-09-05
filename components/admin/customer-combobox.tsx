"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CustomerForm } from "@/components/forms/customer-form";
import type { AppUser } from "@/lib/types";

/**
 * Kundensuche mit Schnellanlage, für die Rechnungserstellung. Filtert
 * client-seitig über die volle Kundenliste (getCustomers() liefert ohnehin
 * alle, siehe lib/queries/admin.ts) statt eigener Server-Suche – bei der
 * überschaubaren Kundenzahl eines Großhandels reicht das.
 *
 * "+ Neuer Kunde" öffnet das bestehende CustomerForm in einem Dialog. Nach
 * dem Anlegen ruft CustomerForm selbst router.refresh() auf (siehe
 * components/forms/customer-form.tsx), wodurch die Elternseite
 * getCustomers() neu lädt und die `customers`-Prop hier automatisch die neue
 * Person enthält – ohne dass diese Komponente etwas davon wissen muss.
 */
export function CustomerCombobox({
  customers,
  value,
  onChange,
}: {
  customers: AppUser[];
  value: string | null;
  onChange: (customerId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const selected = customers.find((customer) => customer.id === value) ?? null;

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = term
      ? customers.filter((customer) =>
          [customer.company_name, customer.full_name, customer.email]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(term)),
        )
      : customers;
    return pool.slice(0, 20);
  }, [customers, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={
            selected
              ? selected.company_name || selected.full_name || selected.email
              : query
          }
          onChange={(event) => {
            onChange(null);
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Firma, Name oder E-Mail suchen …"
          className="pl-9"
        />
      </div>

      {open ? (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Kein Kunde gefunden.
            </p>
          ) : (
            filtered.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(customer.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="block font-medium">
                  {customer.company_name || customer.full_name || "–"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {customer.email}
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setDialogOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-medium hover:bg-muted"
          >
            <Plus className="size-4" aria-hidden />
            Neuer Kunde
          </button>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuer Kunde</DialogTitle>
          </DialogHeader>
          <CustomerForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}

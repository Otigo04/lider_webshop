"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";
import { saveVoucher } from "@/lib/actions/admin-vouchers";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { CustomerCombobox } from "@/components/admin/customer-combobox";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalisiereCode, zufallsCode } from "@/lib/rabatt";
import type { AppUser, Category, Voucher } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Zeitpunkt → Kalendertag in Berlin, für das Datumsfeld. */
function berlinTag(iso: string | null, minusEinTag = false): string {
  if (!iso) return "";
  const t = new Date(iso).getTime() - (minusEinTag ? 1 : 0);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(t);
}

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Wird gespeichert …" : isEdit ? "Änderungen speichern" : "Gutschein anlegen"}
    </Button>
  );
}

export function VoucherForm({
  voucher,
  customers,
  categories,
  vorgabeKunde,
  zurueck = "/admin/gutscheine",
}: {
  voucher?: Voucher;
  customers: AppUser[];
  /** Warengruppen zur Auswahl, wenn der Gutschein nicht für alles gelten soll */
  categories: Pick<Category, "id" | "name">[];
  /** Vorbelegung, wenn der Gutschein aus der Kundenseite heraus entsteht */
  vorgabeKunde?: string | null;
  /** Wohin es nach dem Speichern geht */
  zurueck?: string;
}) {
  const isEdit = Boolean(voucher);
  const [state, formAction] = useActionState<AdminFormState, FormData>(saveVoucher, {});
  const router = useRouter();

  const [code, setCode] = useState(voucher?.code ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(voucher?.kind ?? "percent");
  // 0 heißt in den optionalen Feldern „keine Grenze" – NumericInput kennt
  // kein Leer nach außen.
  const [value, setValue] = useState(voucher ? Number(voucher.value) : 10);
  const [minWert, setMinWert] = useState(voucher ? Number(voucher.min_order_amount) : 0);
  const [maxGesamt, setMaxGesamt] = useState(voucher?.max_redemptions ?? 0);
  const [maxKunde, setMaxKunde] = useState(voucher ? (voucher.max_per_customer ?? 0) : 1);
  const [kunde, setKunde] = useState<string | null>(voucher?.customer_id ?? vorgabeKunde ?? null);
  const [nurKunde, setNurKunde] = useState(Boolean(voucher?.customer_id ?? vorgabeKunde));
  const [gruppen, setGruppen] = useState<string[]>(voucher?.category_ids ?? []);
  const [nurGruppen, setNurGruppen] = useState((voucher?.category_ids ?? []).length > 0);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (!state.success) return;
    toast.success(state.success);
    router.push(zurueck);
    router.refresh();
  }, [state, router, zurueck]);

  return (
    <form action={formAction} className="space-y-4">
      {voucher ? <input type="hidden" name="id" value={voucher.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="min_order_amount" value={minWert > 0 ? minWert : ""} />
      <input type="hidden" name="max_redemptions" value={maxGesamt > 0 ? maxGesamt : ""} />
      <input type="hidden" name="max_per_customer" value={maxKunde > 0 ? maxKunde : ""} />
      <input type="hidden" name="customer_id" value={nurKunde ? (kunde ?? "") : ""} />
      {nurGruppen
        ? gruppen.map((id) => <input key={id} type="hidden" name="category_ids" value={id} />)
        : null}

      <div className="space-y-1.5">
        <Label htmlFor="code">Gutscheincode</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            name="code"
            required
            value={code}
            onChange={(e) => setCode(normalisiereCode(e.target.value))}
            placeholder="z. B. HERBST10"
            maxLength={32}
            className="code font-semibold tracking-wider"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCode(zufallsCode())}
            title="Zufälligen Code erzeugen"
            aria-label="Zufälligen Code erzeugen"
          >
            <Shuffle className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Buchstaben, Ziffern, Bindestrich. Groß-/Kleinschreibung egal.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Rabatt</Label>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(
            [
              ["percent", "Prozent"],
              ["fixed", "Fester Betrag"],
            ] as const
          ).map(([wert, label]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setKind(wert)}
              aria-pressed={kind === wert}
              className={cn(
                "rounded px-2 py-1.5 text-sm font-medium transition-colors",
                kind === wert
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <NumericInput
            value={value}
            onChange={setValue}
            dezimal
            aria-label="Rabattwert"
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">
            {kind === "percent" ? "% auf den Warenwert" : "€ netto Abzug"}
          </span>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={nurGruppen}
            onChange={(e) => setNurGruppen(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          Nur für bestimmte Warengruppen
        </label>
        {nurGruppen ? (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={gruppen.includes(category.id)}
                    onChange={(e) =>
                      setGruppen((alt) =>
                        e.target.checked
                          ? [...alt, category.id]
                          : alt.filter((id) => id !== category.id),
                      )
                    }
                    className="size-4 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 truncate">{category.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {gruppen.length === 0
                ? "Ohne Auswahl gilt der Gutschein für alle Warengruppen."
                : "Rabatt und Mindestbestellwert rechnen nur auf Artikel dieser Warengruppen."}
            </p>
          </>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>Mindestbestellwert (netto)</Label>
        <div className="flex items-center gap-2">
          <NumericInput
            value={minWert}
            onChange={setMinWert}
            dezimal
            aria-label="Mindestbestellwert"
            className="w-32"
          />
          <span className="text-sm text-muted-foreground">€, 0 = keiner</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="valid_from">Gültig ab</Label>
          <Input
            id="valid_from"
            name="valid_from"
            type="date"
            defaultValue={berlinTag(voucher?.valid_from ?? null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="valid_until">Gültig bis</Label>
          <Input
            id="valid_until"
            name="valid_until"
            type="date"
            defaultValue={berlinTag(voucher?.valid_until ?? null, true)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Einlösungen gesamt</Label>
          <NumericInput
            value={maxGesamt}
            onChange={setMaxGesamt}
            aria-label="Einlösungen gesamt"
          />
          <p className="text-xs text-muted-foreground">0 = unbegrenzt</p>
        </div>
        <div className="space-y-1.5">
          <Label>je Kunde</Label>
          <NumericInput
            value={maxKunde}
            onChange={setMaxKunde}
            aria-label="Einlösungen je Kunde"
          />
          <p className="text-xs text-muted-foreground">0 = unbegrenzt</p>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={nurKunde}
            onChange={(e) => setNurKunde(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          Nur für einen bestimmten Kunden
        </label>
        {nurKunde ? (
          <CustomerCombobox
            customers={customers.filter((c) => c.role === "customer")}
            value={kunde}
            onChange={setKunde}
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Interne Notiz</Label>
        <Input
          id="description"
          name="description"
          maxLength={300}
          defaultValue={voucher?.description ?? ""}
          placeholder="z. B. Messe Oktober, Flyer Neukunden"
        />
        <p className="text-xs text-muted-foreground">Sieht nur die Verwaltung.</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={voucher?.is_active ?? true}
          className="size-4 accent-[var(--brand)]"
        />
        Aktiv – kann eingelöst werden
      </label>

      <SubmitButton isEdit={isEdit} />
    </form>
  );
}

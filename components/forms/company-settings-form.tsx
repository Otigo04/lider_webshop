"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { updateCompanySettings } from "@/lib/actions/admin-settings";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompanySettings } from "@/lib/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </Button>
  );
}

export function CompanySettingsForm({ settings }: { settings: CompanySettings }) {
  const [state, formAction] = useActionState<AdminFormState, FormData>(
    updateCompanySettings,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-8">
      <section>
        <h2 className="font-medium">Firma</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="company_name">Firmenname</Label>
            <Input
              id="company_name"
              name="company_name"
              defaultValue={settings.company_name ?? ""}
              maxLength={160}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address_street">Straße und Hausnummer</Label>
            <Input
              id="address_street"
              name="address_street"
              defaultValue={settings.address_street ?? ""}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_zip">PLZ</Label>
            <Input
              id="address_zip"
              name="address_zip"
              defaultValue={settings.address_zip ?? ""}
              maxLength={20}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_city">Ort</Label>
            <Input
              id="address_city"
              name="address_city"
              defaultValue={settings.address_city ?? ""}
              maxLength={120}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address_country">Land</Label>
            <Input
              id="address_country"
              name="address_country"
              defaultValue={settings.address_country}
              required
              maxLength={80}
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="font-medium">Steuer &amp; Bank</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tax_number">Steuernummer</Label>
            <Input
              id="tax_number"
              name="tax_number"
              defaultValue={settings.tax_number ?? ""}
              maxLength={60}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat_id">USt-IdNr.</Label>
            <Input
              id="vat_id"
              name="vat_id"
              defaultValue={settings.vat_id ?? ""}
              maxLength={60}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="bank_name">Bank</Label>
            <Input
              id="bank_name"
              name="bank_name"
              defaultValue={settings.bank_name ?? ""}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input
              id="iban"
              name="iban"
              defaultValue={settings.iban ?? ""}
              maxLength={60}
              className="tabular"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bic">BIC</Label>
            <Input
              id="bic"
              name="bic"
              defaultValue={settings.bic ?? ""}
              maxLength={20}
              className="tabular"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_terms_days">Zahlungsziel (Tage)</Label>
            <Input
              id="payment_terms_days"
              name="payment_terms_days"
              type="number"
              min={0}
              max={365}
              step={1}
              defaultValue={settings.payment_terms_days}
              className="tabular"
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <h2 className="font-medium">Ladenkasse</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Gilt für Verkäufe über den Tresen unter „Kasse“. Der Steuersatz steht
          hier und nicht im Programmcode – eine spätere Änderung ist damit eine
          Eingabe, kein Update.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pos_vat_rate">Steuersatz (%)</Label>
            <select
              id="pos_vat_rate"
              name="pos_vat_rate"
              defaultValue={String(settings.pos_vat_rate)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="19">19 % – Regelsatz</option>
              <option value="7">7 % – ermäßigt</option>
              <option value="0">0 % – steuerfrei</option>
            </select>
          </div>

          <div className="flex items-center gap-2 self-end pb-2">
            <Checkbox
              id="pos_prices_gross"
              name="pos_prices_gross"
              defaultChecked={settings.pos_prices_gross}
            />
            <Label htmlFor="pos_prices_gross" className="font-normal">
              Kassenpreise sind Endpreise inkl. USt.
            </Label>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pos_receipt_footer">Fußzeile auf dem Kassenbon</Label>
            <Textarea
              id="pos_receipt_footer"
              name="pos_receipt_footer"
              rows={2}
              maxLength={300}
              defaultValue={settings.pos_receipt_footer ?? ""}
              placeholder="z. B. Öffnungszeiten oder Hinweis zum Umtausch"
            />
          </div>
        </div>
      </section>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

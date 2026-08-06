"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleProductFlag } from "@/lib/actions/admin-products";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Speichert sofort beim Umschalten – kein Save-Button, kein Bestätigungs-
 * dialog. Nicht destruktiv (anders als ConfirmAction-Fälle), deshalb reicht
 * eine direkte Transition statt useActionState.
 */
export function ProductFlagToggle({
  productId,
  checked,
  label,
}: {
  productId: string;
  checked: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(next: boolean) {
    const formData = new FormData();
    formData.set("id", productId);
    formData.set("is_new", String(next));

    startTransition(async () => {
      const result = await toggleProductFlag({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => handleChange(next === true)}
        aria-label={label}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  toggleProductFlag,
  type ProductFlag,
} from "@/lib/actions/admin-products";
import { toggleProductFlagLink } from "@/lib/actions/product-flags";
import type { ProductFlagDef } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FLAG_LABELS: Record<ProductFlag, string> = {
  is_new: "Neuheit",
  is_topseller: "Topseller",
};

/**
 * Dropdown mit Checkboxen statt einer Spalte pro Flag – skaliert, wenn
 * weitere Flags dazukommen. Jede Checkbox speichert sofort beim Umschalten,
 * kein Save-Button, kein Bestätigungsdialog (nicht destruktiv). Das Menü
 * bleibt beim Klick offen, damit mehrere Flags nacheinander gesetzt werden
 * können.
 *
 * Zwei Quellen in einem Menü: die festen Flags (is_new/is_topseller, eigenes
 * Verhalten im Shop) und die frei definierten Flags aus /admin/settings
 * (rein intern, andere Tabelle, deshalb eigene Toggle-Funktion).
 */
export function ProductFlagsMenu({
  productId,
  flags,
  customFlags,
  activeCustomFlagIds,
}: {
  productId: string;
  flags: Record<ProductFlag, boolean>;
  customFlags: ProductFlagDef[];
  activeCustomFlagIds: string[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(flag: ProductFlag, next: boolean) {
    const formData = new FormData();
    formData.set("id", productId);
    formData.set("flag", flag);
    formData.set("value", String(next));

    startTransition(async () => {
      const result = await toggleProductFlag({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCustomChange(flagId: string, next: boolean) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("flagId", flagId);
    formData.set("value", String(next));

    startTransition(async () => {
      const result = await toggleProductFlagLink({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  const activeCustomSet = new Set(activeCustomFlagIds);
  const labels = [
    ...(Object.keys(flags) as ProductFlag[])
      .filter((flag) => flags[flag])
      .map((flag) => FLAG_LABELS[flag]),
    ...customFlags.filter((flag) => activeCustomSet.has(flag.id)).map((flag) => flag.name),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="gap-1">
          {labels.length > 0 ? labels.join(", ") : "Flags"}
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(FLAG_LABELS) as ProductFlag[]).map((flag) => (
          <DropdownMenuCheckboxItem
            key={flag}
            checked={flags[flag]}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => handleChange(flag, checked === true)}
          >
            {FLAG_LABELS[flag]}
          </DropdownMenuCheckboxItem>
        ))}

        {customFlags.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Eigene Flags</DropdownMenuLabel>
            {customFlags.map((flag) => (
              <DropdownMenuCheckboxItem
                key={flag.id}
                checked={activeCustomSet.has(flag.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  handleCustomChange(flag.id, checked === true)
                }
              >
                <span
                  aria-hidden
                  className={`mr-1.5 inline-block size-2 rounded-full tag-dot-${flag.color}`}
                />
                {flag.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

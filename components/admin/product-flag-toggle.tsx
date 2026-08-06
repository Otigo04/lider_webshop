"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  toggleProductFlag,
  type ProductFlag,
} from "@/lib/actions/admin-products";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
 */
export function ProductFlagsMenu({
  productId,
  flags,
}: {
  productId: string;
  flags: Record<ProductFlag, boolean>;
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

  const activeCount = Object.values(flags).filter(Boolean).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="gap-1">
          {activeCount > 0
            ? (Object.keys(flags) as ProductFlag[])
                .filter((flag) => flags[flag])
                .map((flag) => FLAG_LABELS[flag])
                .join(", ")
            : "Flags"}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

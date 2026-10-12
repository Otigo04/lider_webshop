"use client";

import { useState } from "react";
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
  is_restposten: "Restposten",
  is_preorder: "Vorbestellbar",
};

/**
 * Dropdown mit Checkboxen statt einer Spalte pro Flag – skaliert, wenn
 * weitere Flags dazukommen. Jede Checkbox speichert sofort beim Umschalten,
 * kein Save-Button, kein Bestätigungsdialog (nicht destruktiv).
 *
 * **Mehrere Flags nacheinander:** das Menü bleibt offen, der Haken springt
 * sofort (lokaler Stand), und die Seite wird erst beim Schließen des Menüs neu
 * geladen. Vorher löste jeder Klick ein `router.refresh()` der ganzen
 * Artikelliste aus und sperrte den Knopf, bis es durch war – das Menü klappte
 * zu, und es fühlte sich an, als ginge nur ein Flag je Öffnen.
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
  const router = useRouter();
  const [fest, setFest] = useState(flags);
  const [eigene, setEigene] = useState(() => new Set(activeCustomFlagIds));
  const [geaendert, setGeaendert] = useState(false);

  // Stand vom Server übernehmen, sobald er sich geändert hat (nach dem
  // Neuladen oder wenn ein anderer Weg das Flag gesetzt hat).
  const serverStand = JSON.stringify([flags, [...activeCustomFlagIds].sort()]);
  const [gesehen, setGesehen] = useState(serverStand);
  if (gesehen !== serverStand) {
    setGesehen(serverStand);
    setFest(flags);
    setEigene(new Set(activeCustomFlagIds));
  }

  async function handleChange(flag: ProductFlag, next: boolean) {
    setFest((alt) => ({ ...alt, [flag]: next }));
    setGeaendert(true);

    const formData = new FormData();
    formData.set("id", productId);
    formData.set("flag", flag);
    formData.set("value", String(next));

    const result = await toggleProductFlag({}, formData);
    if (result.error) {
      toast.error(result.error);
      setFest((alt) => ({ ...alt, [flag]: !next }));
    }
  }

  async function handleCustomChange(flagId: string, next: boolean) {
    const setzen = (an: boolean) =>
      setEigene((alt) => {
        const neu = new Set(alt);
        if (an) neu.add(flagId);
        else neu.delete(flagId);
        return neu;
      });
    setzen(next);
    setGeaendert(true);

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("flagId", flagId);
    formData.set("value", String(next));

    const result = await toggleProductFlagLink({}, formData);
    if (result.error) {
      toast.error(result.error);
      setzen(!next);
    }
  }

  function beiOeffnen(offen: boolean) {
    if (!offen && geaendert) {
      setGeaendert(false);
      router.refresh();
    }
  }

  const labels = [
    ...(Object.keys(fest) as ProductFlag[])
      .filter((flag) => fest[flag])
      .map((flag) => FLAG_LABELS[flag]),
    ...customFlags.filter((flag) => eigene.has(flag.id)).map((flag) => flag.name),
  ];

  return (
    <DropdownMenu onOpenChange={beiOeffnen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto min-h-8 gap-1 whitespace-normal text-left">
          {labels.length > 0 ? labels.join(", ") : "Flags"}
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {(Object.keys(FLAG_LABELS) as ProductFlag[]).map((flag) => (
          <DropdownMenuCheckboxItem
            key={flag}
            checked={fest[flag]}
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
                checked={eigene.has(flag.id)}
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

"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { merkenUmschalten, useMerkliste } from "@/lib/use-merkliste";
import { cn } from "@/lib/utils";

/**
 * Herz zum Merken eines Artikels.
 *
 * Steht auf der Kachel neben dem Link und nicht darin: ein Knopf in einem
 * Link ist ungültiges HTML, und der Klick aufs Herz soll nicht zugleich die
 * Artikelseite öffnen.
 *
 * Auf der Merkliste selbst wird nach dem Umschalten neu geladen: dort soll
 * ein entfernter Artikel auch aus der Liste verschwinden, die der Server
 * gerendert hat.
 */
export function MerkButton({
  productId,
  name,
  className,
  groesse = "kachel",
}: {
  productId: string;
  name: string;
  className?: string;
  groesse?: "kachel" | "gross";
}) {
  const router = useRouter();
  const pfad = usePathname();
  const gemerkt = useMerkliste().includes(productId);

  function umschalten() {
    const jetzt = merkenUmschalten(productId);
    toast.success(jetzt ? "Auf die Merkliste gesetzt." : "Von der Merkliste genommen.", {
      action: jetzt ? { label: "Ansehen", onClick: () => router.push("/merkliste") } : undefined,
    });
    if (pfad === "/merkliste") router.refresh();
  }

  if (groesse === "gross") {
    return (
      <button
        type="button"
        onClick={umschalten}
        aria-pressed={gemerkt}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
          gemerkt
            ? "border-signal/40 bg-signal/5 text-signal"
            : "border-border text-foreground hover:bg-muted",
          className,
        )}
      >
        <Heart className={cn("size-4", gemerkt && "fill-current")} aria-hidden />
        {gemerkt ? "Gemerkt" : "Merken"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={umschalten}
      aria-pressed={gemerkt}
      aria-label={gemerkt ? `„${name}" von der Merkliste nehmen` : `„${name}" merken`}
      title={gemerkt ? "Von der Merkliste nehmen" : "Merken"}
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-border bg-background/95 shadow-sm transition-colors hover:border-signal/50",
        gemerkt ? "text-signal" : "text-muted-foreground hover:text-signal",
        className,
      )}
    >
      <Heart className={cn("size-4", gemerkt && "fill-current")} aria-hidden />
    </button>
  );
}

"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMerkliste } from "@/lib/use-merkliste";

/** Merkliste in der Kopfleiste, mit Zähler – wie der Warenkorb daneben. */
export function MerklisteLink() {
  const anzahl = useMerkliste().length;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="gap-2 text-surface-dark-muted hover:bg-white/10 hover:text-surface-dark-foreground"
    >
      <Link href="/merkliste" aria-label={`Merkliste, ${anzahl} Artikel`}>
        <Heart className="size-4" aria-hidden />
        {anzahl > 0 ? (
          <span className="rounded-full bg-signal px-1.5 py-0.5 text-xs font-medium text-signal-foreground tabular">
            {anzahl}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

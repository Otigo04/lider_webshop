"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { moveBanner } from "@/lib/actions/category-banners";
import { moveSlide } from "@/lib/actions/home-slides";

/** Reihenfolge der Werbebilder: ein Schritt nach oben oder unten. */
export function SlideMoveButtons({
  id,
  oben,
  unten,
  gruppe = false,
}: {
  id: string;
  /** Banner einer Warengruppe statt Werbebild der Startseite */
  gruppe?: boolean;
  oben: boolean;
  unten: boolean;
}) {
  const [laeuft, starten] = useTransition();
  const router = useRouter();

  function schieben(richtung: "hoch" | "runter") {
    starten(async () => {
      const ergebnis = await (gruppe ? moveBanner : moveSlide)(id, richtung);
      if (ergebnis.error) toast.error(ergebnis.error);
      router.refresh();
    });
  }

  const knopf =
    "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="flex flex-col">
      <button
        type="button"
        className={knopf}
        disabled={oben || laeuft}
        onClick={() => schieben("hoch")}
        aria-label="Nach oben"
      >
        <ChevronUp className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={knopf}
        disabled={unten || laeuft}
        onClick={() => schieben("runter")}
        aria-label="Nach unten"
      >
        <ChevronDown className="size-4" aria-hidden />
      </button>
    </div>
  );
}

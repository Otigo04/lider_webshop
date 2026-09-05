"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { tagAbschliessen } from "@/lib/actions/kasse";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Z-Abschluss auslösen.
 *
 * Mit Rückfrage, weil ein Abschluss eine Zahl festschreibt und in der
 * Buchhaltung landet – kein Vorgang für einen versehentlichen Klick. Die
 * Notiz ist optional und steht später auf dem Z-Bon (Kassendifferenz,
 * besondere Vorkommnisse).
 *
 * Die Action wird direkt aufgerufen statt über useActionState: der Dialog
 * schließt sich nach Erfolg, und das ist eine Reaktion auf das Ergebnis, kein
 * Zustand, den ein Effekt nachträglich einholen müsste.
 */
export function TagAbschliessenButton({
  datum,
  label,
  neu = false,
  laufend = false,
  variante = "default",
}: {
  /** Kassentag als YYYY-MM-DD */
  datum: string;
  /** Beschriftung im Dialog, z. B. "Freitag, 05.09.2026" */
  label: string;
  /** Es gibt schon einen Abschluss – die Zahlen werden neu gerechnet */
  neu?: boolean;
  /** Der Tag läuft noch: Hinweis, dass spätere Verkäufe fehlen würden */
  laufend?: boolean;
  variante?: "default" | "outline" | "secondary" | "ghost";
}) {
  const [offen, setOffen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function absenden(formData: FormData) {
    startTransition(async () => {
      const ergebnis = await tagAbschliessen({}, formData);

      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }

      if (ergebnis.success) toast.success(ergebnis.success);
      setOffen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variante}
        onClick={() => setOffen(true)}
      >
        {neu ? (
          <RefreshCw className="size-4" aria-hidden />
        ) : (
          <Lock className="size-4" aria-hidden />
        )}
        {neu ? "Neu abschließen" : "Z-Abschluss"}
      </Button>

      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {neu ? "Abschluss neu rechnen" : "Tagesabschluss buchen"}
            </DialogTitle>
            <DialogDescription>
              {label}
              {neu
                ? " – die Zahlen werden neu aus den Bons gerechnet. Die Z-Nummer bleibt."
                : " – die Tagessumme wird festgeschrieben und bekommt eine Z-Nummer."}
              {laufend
                ? " Der Tag läuft noch: Verkäufe nach diesem Abschluss sind nicht enthalten, lassen sich aber jederzeit nachrechnen."
                : ""}
            </DialogDescription>
          </DialogHeader>

          <form action={absenden} className="space-y-4">
            <input type="hidden" name="datum" value={datum} />
            <div className="space-y-2">
              <Label htmlFor={`notiz-${datum}`}>Notiz (optional)</Label>
              <Input
                id={`notiz-${datum}`}
                name="notiz"
                maxLength={500}
                placeholder="z. B. Kassendifferenz −2,50 €"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOffen(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Wird gebucht …"
                  : neu
                    ? "Neu abschließen"
                    : "Tag abschließen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

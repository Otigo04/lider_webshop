"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser } from "lucide-react";
import { toast } from "sonner";
import { abschluesseZuruecksetzen } from "@/lib/actions/kasse";
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

const BESTAETIGUNG = "ZURÜCKSETZEN";

/**
 * Alle Tagesabschlüsse verwerfen – der Ausweg aus der Einrichtungsphase.
 *
 * Getippte Bestätigung statt bloßer Rückfrage: hier wird nicht ein einzelner
 * Eintrag entfernt, sondern die gesamte Z-Reihe samt Nummerierung. Wer das
 * versehentlich tut, merkt es erst, wenn die Buchhaltung danach fragt.
 */
export function AbschluesseZuruecksetzen({ anzahl }: { anzahl: number }) {
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function absenden(formData: FormData) {
    startTransition(async () => {
      const ergebnis = await abschluesseZuruecksetzen({}, formData);

      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }

      if (ergebnis.success) toast.success(ergebnis.success);
      setOffen(false);
      setEingabe("");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOffen(true)}
      >
        <Eraser className="size-4" aria-hidden />
        Alle Abschlüsse verwerfen
      </Button>

      <Dialog
        open={offen}
        onOpenChange={(zustand) => {
          setOffen(zustand);
          if (!zustand) setEingabe("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alle Tagesabschlüsse verwerfen</DialogTitle>
            <DialogDescription>
              {anzahl === 1
                ? "Der eine vorhandene Abschluss wird gelöscht"
                : `Alle ${anzahl} Abschlüsse werden gelöscht`}{" "}
              und die Nummerierung beginnt wieder bei Z00001. Die Verkäufe
              selbst bleiben erhalten – nur die Festschreibung fällt weg. Die
              automatische Nachholung startet danach beim heutigen Tag.
            </DialogDescription>
          </DialogHeader>

          <form action={absenden} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bestaetigung">
                Zum Bestätigen <span className="font-mono">{BESTAETIGUNG}</span>{" "}
                eintippen
              </Label>
              <Input
                id="bestaetigung"
                name="bestaetigung"
                value={eingabe}
                onChange={(event) => setEingabe(event.target.value)}
                autoComplete="off"
                spellCheck={false}
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
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || eingabe.trim() !== BESTAETIGUNG}
              >
                {pending ? "Läuft …" : "Verwerfen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

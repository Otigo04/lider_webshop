"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { stornoRechnung } from "@/lib/actions/storno";

/**
 * Rechnung stornieren: Grund (optional) und die Wahl, ob der Kunde die
 * Stornorechnung per Mail bekommt. Der Dialog sagt vorher, was passiert – eine
 * Stornierung lässt sich nicht zurücknehmen.
 */
export function StornoButton({
  invoiceId,
  nummer,
  bezahlt,
  mitBestellung,
}: {
  invoiceId: string;
  nummer: string;
  bezahlt: boolean;
  mitBestellung: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState("");
  const [mail, setMail] = useState(true);
  const [laeuft, start] = useTransition();
  const router = useRouter();

  function stornieren() {
    start(async () => {
      const formData = new FormData();
      formData.set("invoice_id", invoiceId);
      formData.set("reason", grund);
      formData.set("mail", mail ? "1" : "0");
      const ergebnis = await stornoRechnung({}, formData);
      if (ergebnis.error) {
        toast.error(ergebnis.error);
        return;
      }
      toast.success(ergebnis.success ?? "Rechnung storniert.");
      setOffen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setOffen(true)}
      >
        Stornieren
      </Button>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechnung {nummer} stornieren?</DialogTitle>
            <DialogDescription>
              Die Rechnung bleibt bestehen und wird als storniert geführt. Dazu
              entsteht eine Stornorechnung mit eigener Nummer und negativen
              Beträgen.{mitBestellung ? " Die zugehörige Bestellung steht danach auf „Storniert“." : ""}{" "}
              Das lässt sich nicht zurücknehmen.
              {bezahlt
                ? " Die Rechnung ist als bezahlt markiert – die Erstattung musst du selbst veranlassen."
                : ""}{" "}
              Bestand und reservierte Mengen werden nicht verändert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="storno-grund">Grund (optional, steht auf der Stornorechnung)</Label>
              <Textarea
                id="storno-grund"
                value={grund}
                onChange={(event) => setGrund(event.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="storno-mail"
                checked={mail}
                onCheckedChange={(an) => setMail(an === true)}
              />
              <Label htmlFor="storno-mail" className="font-normal">
                Stornorechnung per E-Mail an den Kunden schicken
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOffen(false)} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button type="button" variant="destructive" onClick={stornieren} disabled={laeuft}>
              {laeuft ? "Läuft …" : "Stornieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { abonniere, entferneGeraet, setzeSchalter, testeGeraet } from "@/lib/actions/push";
import { formatDateTime } from "@/lib/format";
import {
  aboDaten,
  aktuellesAbo,
  ermittleZustand,
  istIosGeraet,
  istInstalliert,
  meldeAn,
  pushUnterstuetzt,
  type PushZustand,
} from "@/lib/push-client";

export interface PushGeraet {
  id: string;
  endpoint: string;
  geraet: string;
  bei_bestellung: boolean;
  bei_neukunde: boolean;
  zuletzt_ok: string | null;
}

type Feld = "bei_bestellung" | "bei_neukunde";

/**
 * Benachrichtigungen in /account, nur für Admins. Oben der Zustand DIESES
 * Geräts (fünf Ansichten), darunter alle Geräte mit ihren Schaltern.
 */
export function PushEinstellungen({ geraete }: { geraete: PushGeraet[] }) {
  const router = useRouter();
  // Schalter-Änderungen, die schon angeklickt, aber noch nicht vom Server
  // bestätigt sind (Schlüssel "id:feld"). Statt die Props per Effekt in einen
  // State zu kopieren, liegen sie über dem Server-Stand: Nach router.refresh()
  // folgt die Liste automatisch den neuen Props, ein Fehler räumt den Eintrag
  // einfach wieder weg.
  const [vorlaeufig, setVorlaeufig] = useState<Record<string, boolean>>({});
  const [zustand, setZustand] = useState<PushZustand | null>(null);
  const [dieses, setDieses] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);

  const liste = geraete.map((g) => ({
    ...g,
    bei_bestellung: vorlaeufig[`${g.id}:bei_bestellung`] ?? g.bei_bestellung,
    bei_neukunde: vorlaeufig[`${g.id}:bei_neukunde`] ?? g.bei_neukunde,
  }));

  useEffect(() => {
    (async () => {
      const hatPush = pushUnterstuetzt();
      const ios = istIosGeraet({
        ua: navigator.userAgent,
        plattform: navigator.platform,
        touchPunkte: navigator.maxTouchPoints,
      });
      let endpoint: string | null = null;
      if (hatPush && Notification.permission === "granted") {
        try {
          endpoint = (await aktuellesAbo())?.endpoint ?? null;
        } catch {
          endpoint = null;
        }
      }
      setDieses(endpoint);
      setZustand(
        ermittleZustand({
          hatPush,
          istIos: ios,
          istInstalliert: istInstalliert(),
          erlaubnis: hatPush ? Notification.permission : "unbekannt",
          abonniert: endpoint !== null,
        }),
      );
    })();
  }, []);

  async function aktivieren() {
    setBeschaeftigt("aktivieren");
    try {
      // Muss direkt aus dem Klick heraus gefragt werden, sonst verweigert iOS.
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") {
        setZustand(erlaubnis === "denied" ? "blockiert" : "erlaubnis-offen");
        return;
      }
      const abo = await meldeAn();
      const antwort = await abonniere(aboDaten(abo));
      if (!antwort.ok) {
        toast.error(antwort.error);
        return;
      }
      setDieses(abo.endpoint);
      setZustand("aktiv");
      toast.success("Benachrichtigungen sind aktiv.");
      router.refresh();
    } catch (err) {
      console.error("[push] aktivieren:", err);
      toast.error("Die Benachrichtigungen konnten nicht aktiviert werden.");
    } finally {
      setBeschaeftigt(null);
    }
  }

  async function schalten(g: PushGeraet, feld: Feld, an: boolean) {
    const schluessel = `${g.id}:${feld}`;
    setVorlaeufig((alt) => ({ ...alt, [schluessel]: an }));
    const antwort = await setzeSchalter({ id: g.id, feld, an });
    if (!antwort.ok) {
      // Zurück auf den Stand vom Server.
      setVorlaeufig((alt) => {
        const rest = { ...alt };
        delete rest[schluessel];
        return rest;
      });
      toast.error(antwort.error);
    }
  }

  async function testen(g: PushGeraet) {
    setBeschaeftigt(g.id);
    const antwort = await testeGeraet({ id: g.id });
    setBeschaeftigt(null);
    if (!antwort.ok) {
      toast.error(antwort.error);
      return;
    }
    if (antwort.ergebnis === "gesendet") toast.success("Test gesendet – er sollte gleich erscheinen.");
    else if (antwort.ergebnis === "entfernt") {
      toast.error("Dieses Gerät war nicht mehr erreichbar und wurde entfernt.");
      router.refresh();
    } else if (antwort.ergebnis === "nicht-konfiguriert") {
      toast.error("Der Versand ist auf dem Server noch nicht eingerichtet.");
    } else toast.error("Der Test konnte nicht zugestellt werden.");
  }

  async function entfernen(g: PushGeraet) {
    setBeschaeftigt(g.id);
    const antwort = await entferneGeraet({ id: g.id });
    if (!antwort.ok) {
      setBeschaeftigt(null);
      toast.error(antwort.error);
      return;
    }
    if (g.endpoint === dieses) {
      try {
        await (await aktuellesAbo())?.unsubscribe();
      } catch {
        /* Der Server-Eintrag ist weg; mehr ist nicht nötig. */
      }
      setDieses(null);
      setZustand("erlaubnis-offen");
    }
    setBeschaeftigt(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Hier legen Sie fest, auf welchen Geräten eine Mitteilung erscheint, wenn eine
        Bestellung eingeht oder sich ein neuer Kunde registriert.
      </p>

      {zustand === null ? (
        <p className="text-sm text-muted-foreground">Gerät wird geprüft …</p>
      ) : zustand === "nicht-unterstuetzt" ? (
        <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
          Dieser Browser unterstützt keine Benachrichtigungen. Auf dem iPhone geht es ab
          iOS 16.4 als Home-Bildschirm-App, auf dem Mac in Safari oder Chrome.
        </p>
      ) : zustand === "ios-installieren" ? (
        <div className="rounded-md border border-gold/50 bg-gold-soft px-4 py-3 text-sm">
          <p className="font-medium">Auf dem iPhone zuerst als App installieren</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Safari unten auf „Teilen“ tippen.</li>
            <li>„Zum Home-Bildschirm“ wählen und bestätigen.</li>
            <li>Die App „LIDER Admin“ vom Home-Bildschirm öffnen und hier zurückkehren.</li>
          </ol>
        </div>
      ) : zustand === "blockiert" ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Benachrichtigungen sind für diese Seite blockiert. Erlauben Sie sie in den
          Einstellungen des Browsers bzw. in den iPhone-Einstellungen unter
          „Mitteilungen“, und laden Sie die Seite neu.
        </p>
      ) : zustand === "erlaubnis-offen" ? (
        <Button type="button" onClick={aktivieren} disabled={beschaeftigt === "aktivieren"}>
          {beschaeftigt === "aktivieren" ? "Wird aktiviert …" : "Benachrichtigungen auf diesem Gerät aktivieren"}
        </Button>
      ) : (
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          Dieses Gerät ist angemeldet.
        </p>
      )}

      {liste.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {liste.map((g) => (
            <li key={g.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-medium">{g.geraet}</p>
                {g.endpoint === dieses ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">dieses Gerät</span>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {g.zuletzt_ok
                    ? `Zuletzt erreicht ${formatDateTime(g.zuletzt_ok)}`
                    : "Noch keine Mitteilung zugestellt"}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${g.id}-bestellung`}
                    checked={g.bei_bestellung}
                    onCheckedChange={(v) => schalten(g, "bei_bestellung", v === true)}
                  />
                  <Label htmlFor={`${g.id}-bestellung`} className="font-normal">
                    Neue Bestellung
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${g.id}-neukunde`}
                    checked={g.bei_neukunde}
                    onCheckedChange={(v) => schalten(g, "bei_neukunde", v === true)}
                  />
                  <Label htmlFor={`${g.id}-neukunde`} className="font-normal">
                    Neuer Kunde
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={beschaeftigt === g.id} onClick={() => testen(g)}>
                  Test senden
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={beschaeftigt === g.id} onClick={() => entfernen(g)}>
                  Entfernen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

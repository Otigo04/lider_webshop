"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Barcode über die Kamera erfassen – der Ersatzweg, wenn der Handscanner
 * ausfällt.
 *
 * Zwei Decoder, in dieser Reihenfolge:
 *   1. `BarcodeDetector` des Browsers, wenn vorhanden. Kostet nichts, weil er
 *      im Browser eingebaut ist – auf Android und macOS ist er da.
 *   2. ZXing als dynamischer Import. Chrome unter Windows kennt
 *      `BarcodeDetector` nicht, und genau dort steht die Ladenkasse. Der
 *      Import läuft erst beim Öffnen dieses Dialogs, damit die Kasse selbst
 *      nicht schwerer lädt.
 *
 * Der Dialog bleibt nach einem Treffer offen: mehrere Artikel hintereinander
 * vor die Kamera zu halten ist der Normalfall. Derselbe Code wird innerhalb
 * von zwei Sekunden nicht doppelt gemeldet, sonst zählt ein still gehaltener
 * Artikel als Dutzend.
 *
 * Die Komponente wird von der Kasse nur eingebaut, solange gescannt wird. Das
 * erspart ein Zurücksetzen des Zustands beim Öffnen und stellt sicher, dass
 * die Kamera beim Schließen zuverlässig freigegeben wird.
 */

/** Sperrfrist für denselben Code, in Millisekunden. */
const WIEDERHOLSPERRE = 2000;

interface Kamera {
  deviceId: string;
  label: string;
}

/** Minimalschnittstelle des eingebauten Decoders – kein DOM-Typ dafür in TS. */
interface NativerDetektor {
  detect(quelle: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetektorKlasse = new (optionen?: { formats?: string[] }) => NativerDetektor;

export function PosCameraScanner({
  onClose,
  onCode,
}: {
  onClose: () => void;
  /** Wird bei jedem erkannten Code aufgerufen – wie ein Scan des Handgeräts. */
  onCode: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const letzterCode = useRef<{ code: string; zeit: number }>({
    code: "",
    zeit: 0,
  });

  const [kameras, setKameras] = useState<Kamera[]>([]);
  const [geraet, setGeraet] = useState<string>("");
  const [status, setStatus] = useState<"startet" | "laeuft" | "fehler">(
    "startet",
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<string | null>(null);
  const [wartetAufFreigabe, setWartetAufFreigabe] = useState(false);

  /*
   * Die Rückmeldung liegt in einem Ref, damit `melden` über die Lebensdauer
   * der Komponente stabil bleibt. Ohne das hinge der Datenstrom an einer
   * Funktion, die die Kasse bei jedem Rendern neu erzeugt – die Kamera würde
   * dann laufend neu gestartet.
   */
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  /** Meldet einen Code weiter, sofern er nicht gerade eben schon kam. */
  const melden = useCallback(
    (code: string) => {
      const sauber = code.trim();
      if (!sauber) return;

      const jetzt = Date.now();
      if (
        letzterCode.current.code === sauber &&
        jetzt - letzterCode.current.zeit < WIEDERHOLSPERRE
      ) {
        return;
      }
      letzterCode.current = { code: sauber, zeit: jetzt };
      setTreffer(sauber);
      onCodeRef.current(sauber);
    },
    [],
  );

  useEffect(() => {
    let abgebrochen = false;

    // Beim ersten Mal blendet Chrome die Rechtefrage über der Seite ein. Bis
    // jemand dort zustimmt, kommt die Kamera nicht – ohne Hinweis sähe das an
    // der Kasse nach einem hängenden Programm aus.
    setWartetAufFreigabe(false);
    const freigabeHinweis = setTimeout(() => setWartetAufFreigabe(true), 2000);

    async function starten() {
      const video = videoRef.current;
      if (!video) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fehler");
        setFehler("Dieser Browser gibt keinen Zugriff auf die Kamera.");
        return;
      }

      try {
        const { BrowserMultiFormatReader, BrowserCodeReader } = await import(
          "@zxing/browser"
        );
        if (abgebrochen) return;

        // Erst nach der Freigabe liefert der Browser echte Kameranamen. Der
        // Aufruf hier ist zugleich die Rechteabfrage.
        const geraete = await BrowserCodeReader.listVideoInputDevices();
        if (abgebrochen) return;

        if (geraete.length === 0) {
          setStatus("fehler");
          setFehler("Es ist keine Kamera angeschlossen.");
          return;
        }

        const liste = geraete.map((g, index) => ({
          deviceId: g.deviceId,
          label: g.label || `Kamera ${index + 1}`,
        }));
        setKameras(liste);

        // Auf Tablets ist die Rückkamera die richtige; am Desktop gibt es nur
        // eine, dann greift schlicht die erste.
        const rueckseitig = liste.find((k) =>
          /back|rear|rück|environment/i.test(k.label),
        );
        const gewaehlt = geraet || rueckseitig?.deviceId || liste[0].deviceId;
        if (!geraet) setGeraet(gewaehlt);

        const nativ = (
          window as unknown as { BarcodeDetector?: DetektorKlasse }
        ).BarcodeDetector;

        if (nativ) {
          await mitNativemDecoder(video, gewaehlt, nativ);
        } else {
          const leser = new BrowserMultiFormatReader(undefined, {
            delayBetweenScanAttempts: 150,
          });
          const steuerung = await leser.decodeFromVideoDevice(
            gewaehlt,
            video,
            (ergebnis) => {
              if (ergebnis) melden(ergebnis.getText());
            },
          );
          stopRef.current = () => steuerung.stop();
        }

        if (abgebrochen) {
          stopRef.current?.();
          stopRef.current = null;
          return;
        }
        setStatus("laeuft");
      } catch (problem) {
        if (abgebrochen) return;
        console.error("[kasse] Kamera:", problem);
        setStatus("fehler");
        setFehler(kameraFehlertext(problem));
      }
    }

    /**
     * Weg über den eingebauten Decoder: eigener Stream, eigene Schleife über
     * requestAnimationFrame. ZXing bringt beides selbst mit, hier nicht.
     */
    async function mitNativemDecoder(
      video: HTMLVideoElement,
      deviceId: string,
      Detektor: DetektorKlasse,
    ) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });
      video.srcObject = stream;
      await video.play();

      const detektor = new Detektor({
        formats: [
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "code_128",
          "code_39",
          "itf",
          "qr_code",
        ],
      });

      let laeuft = true;
      const schleife = async () => {
        if (!laeuft) return;
        try {
          const funde = await detektor.detect(video);
          if (funde.length > 0) melden(funde[0].rawValue);
        } catch {
          // Einzelne Bilder dürfen scheitern (Kamera noch nicht scharf) –
          // das ist kein Grund, die Schleife abzubrechen.
        }
        if (laeuft) requestAnimationFrame(schleife);
      };
      requestAnimationFrame(schleife);

      stopRef.current = () => {
        laeuft = false;
        for (const spur of stream.getTracks()) spur.stop();
        video.srcObject = null;
      };
    }

    void starten();

    return () => {
      abgebrochen = true;
      clearTimeout(freigabeHinweis);
      stopRef.current?.();
      stopRef.current = null;
    };
    // `geraet` gehört dazu: ein Kamerawechsel startet den Datenstrom neu.
  }, [geraet, melden]);

  return (
    <Dialog open onOpenChange={(offen) => !offen && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mit der Kamera scannen</DialogTitle>
          <DialogDescription>
            Barcode ruhig und formatfüllend vor die Kamera halten. Erkannte
            Artikel wandern sofort auf den Bon – das Fenster bleibt offen, bis
            Sie es schließen.
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video overflow-hidden rounded-md border-2 border-border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="size-full object-contain"
          />

          {/* Zielrahmen: sagt, wohin der Barcode gehalten werden soll. */}
          {status === "laeuft" ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[15%] inset-y-[30%] rounded-md border-2 border-gold/80"
            />
          ) : null}

          {status === "startet" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Kamera wird gestartet …
              </span>
              {wartetAufFreigabe ? (
                <span className="text-white/70">
                  Der Browser fragt oben, ob er auf die Kamera zugreifen darf –
                  dort auf „Zulassen“ tippen.
                </span>
              ) : null}
            </div>
          ) : null}

          {status === "fehler" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white">
              <CameraOff className="size-6" aria-hidden />
              {fehler}
            </div>
          ) : null}
        </div>

        {kameras.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="pos-kamera">Kamera</Label>
            <select
              id="pos-kamera"
              value={geraet}
              onChange={(event) => {
                setStatus("startet");
                setFehler(null);
                setGeraet(event.target.value);
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {kameras.map((kamera) => (
                <option key={kamera.deviceId} value={kamera.deviceId}>
                  {kamera.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground" aria-live="polite">
          {treffer ? (
            <>
              Zuletzt erkannt: <span className="code">{treffer}</span>
            </>
          ) : (
            "Noch kein Code erkannt."
          )}
        </p>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            <Camera className="size-4" aria-hidden />
            Fertig
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Die Fehlernamen der Kamera-API in Sätze übersetzen, die im Laden helfen. */
function kameraFehlertext(problem: unknown): string {
  const name =
    problem && typeof problem === "object" && "name" in problem
      ? String((problem as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Der Zugriff auf die Kamera wurde abgelehnt. In der Adressleiste des Browsers lässt er sich wieder freigeben.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Es ist keine passende Kamera angeschlossen.";
    case "NotReadableError":
      return "Die Kamera wird bereits von einem anderen Programm benutzt.";
    default:
      return "Die Kamera konnte nicht gestartet werden.";
  }
}

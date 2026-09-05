"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Barcode über die Kamera erfassen – der Ersatzweg, wenn der Handscanner
 * ausfällt.
 *
 * Bewusst **kein** Dialog, sondern eine Spalte neben der Kasse: ein modales
 * Fenster legt sich mit Weichzeichner über die Seite, und genau das darf hier
 * nicht passieren. Wer dreimal dieselbe Powerbank vor die Linse hält, muss den
 * Bon mitlaufen sehen und eine verzählte Menge sofort korrigieren können,
 * ohne die Kamera zu schließen. Aus demselben Grund greift die Komponente
 * nicht nach dem Tastaturfokus – der bleibt im Scannerfeld, sodass Handgerät
 * und Kamera gleichzeitig benutzbar sind.
 *
 * Zwei Decoder, in dieser Reihenfolge:
 *   1. `BarcodeDetector` des Browsers, wenn vorhanden. Kostet nichts, weil er
 *      im Browser eingebaut ist – auf Android und macOS ist er da.
 *   2. ZXing als dynamischer Import. Chrome unter Windows kennt
 *      `BarcodeDetector` nicht, und genau dort steht die Ladenkasse. Der
 *      Import läuft erst beim Aufklappen dieser Spalte, damit die Kasse selbst
 *      nicht schwerer lädt.
 *
 * Die Spalte bleibt nach einem Treffer offen: mehrere Artikel hintereinander
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
  pausiert = false,
}: {
  onClose: () => void;
  /** Wird bei jedem erkannten Code aufgerufen – wie ein Scan des Handgeräts. */
  onCode: (code: string) => void;
  /**
   * Meldungen zurückhalten, solange ein Fenster über der Kasse liegt (etwa der
   * Anlegedialog für unbekannte Ware). Das Bild läuft weiter – nur gebucht
   * wird nichts, sonst schöbe die Kamera Artikel hinter dem offenen Fenster
   * auf den Bon.
   */
  pausiert?: boolean;
}) {
  /*
   * Das Videoelement steht im Zustand, nicht in einem Ref. Der Dialoginhalt
   * hängt sich erst nach den Effekten dieser Komponente in die Seite – ein
   * Ref wäre beim Start also noch leer, der Kamerastart bliebe stumm liegen
   * und das Fenster zeigte für immer „Kamera wird gestartet“. Über den
   * Zustand läuft der Effekt erneut, sobald das Element wirklich da ist.
   */
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
    null,
  );
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

  // Gleiches Muster: die Pause darf `melden` nicht neu erzeugen, sonst liefe
  // der Datenstrom bei jedem Umschalten neu an.
  const pausiertRef = useRef(pausiert);
  useEffect(() => {
    pausiertRef.current = pausiert;
  }, [pausiert]);

  /** Meldet einen Code weiter, sofern er nicht gerade eben schon kam. */
  const melden = useCallback(
    (code: string) => {
      if (pausiertRef.current) return;

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
    if (!videoElement) return;
    const video = videoElement;
    let abgebrochen = false;

    // Beim ersten Mal blendet Chrome die Rechtefrage über der Seite ein. Bis
    // jemand dort zustimmt, kommt die Kamera nicht – ohne Hinweis sähe das an
    // der Kasse nach einem hängenden Programm aus. Zurückgesetzt wird der
    // Hinweis beim Aufräumen; beim Einbau steht er ohnehin auf `false`.
    const freigabeHinweis = setTimeout(() => setWartetAufFreigabe(true), 2000);

    async function starten() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("fehler");
        setFehler("Dieser Browser gibt keinen Zugriff auf die Kamera.");
        return;
      }

      // Die Rechtefrage stellt allein `getUserMedia`. `enumerateDevices`
      // fragt nichts: ohne Freigabe kommen Geräte ohne Kennung und ohne Namen
      // zurück, und ein `exact`-Filter auf die leere Kennung scheitert mit
      // OverconstrainedError – an der Kasse sähe das nach einer fehlenden
      // Kamera aus, obwohl nur die Freigabe fehlt. Also erst fragen, dann
      // auflisten.
      let freigabe: MediaStream | null = null;
      const freigabeLoesen = () => {
        if (!freigabe) return;
        for (const spur of freigabe.getTracks()) spur.stop();
        freigabe = null;
      };

      try {
        freigabe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const freigegeben =
          freigabe.getVideoTracks()[0]?.getSettings().deviceId ?? "";

        const { BrowserMultiFormatReader, BrowserCodeReader } = await import(
          "@zxing/browser"
        );
        if (abgebrochen) return;

        // Jetzt liefert der Browser echte Kennungen und Kameranamen.
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
        const gewaehlt =
          geraet || rueckseitig?.deviceId || freigegeben || liste[0].deviceId;
        if (!geraet) setGeraet(gewaehlt);

        const nativ = (
          window as unknown as { BarcodeDetector?: DetektorKlasse }
        ).BarcodeDetector;

        if (nativ) {
          // Zeigt die Freigabe schon auf die gewählte Kamera, läuft ihr Strom
          // weiter – dasselbe Gerät ein zweites Mal zu öffnen spart das.
          const strom =
            gewaehlt === freigegeben && freigabe
              ? freigabe
              : await navigator.mediaDevices.getUserMedia({
                  video: { deviceId: { exact: gewaehlt } },
                });
          if (strom !== freigabe) freigabeLoesen();
          // Ab hier gehört der Strom dem Decoder, nicht mehr dem `finally`.
          freigabe = null;
          await mitNativemDecoder(video, strom, nativ);
        } else {
          // ZXing öffnet den Strom selbst; zwei offene Ströme auf derselben
          // Kamera schlagen fehl, also die Freigabe vorher zurückgeben.
          freigabeLoesen();
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
      } finally {
        // Greift nur, wenn der Strom niemand übernommen hat – nach Abbruch
        // oder Fehler. Sonst steht `freigabe` längst auf null.
        freigabeLoesen();
      }
    }

    /**
     * Weg über den eingebauten Decoder: eigene Schleife über
     * requestAnimationFrame. ZXing bringt die selbst mit, hier nicht.
     */
    async function mitNativemDecoder(
      video: HTMLVideoElement,
      stream: MediaStream,
      Detektor: DetektorKlasse,
    ) {
      let laeuft = true;
      // Vor dem ersten `await` setzen: bricht der Dialog währenddessen ab,
      // muss die Aufräumfunktion den Strom schon kennen, sonst läuft die
      // Kamera weiter.
      stopRef.current = () => {
        laeuft = false;
        for (const spur of stream.getTracks()) spur.stop();
        video.srcObject = null;
      };

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
    }

    void starten();

    return () => {
      abgebrochen = true;
      clearTimeout(freigabeHinweis);
      setWartetAufFreigabe(false);
      stopRef.current?.();
      stopRef.current = null;
    };
    // `geraet` gehört dazu: ein Kamerawechsel startet den Datenstrom neu.
  }, [videoElement, geraet, melden]);

  return (
    <aside
      aria-label="Mit der Kamera scannen"
      className="rounded-lg border-2 border-brand/30 bg-card lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-brand-soft px-4 py-2.5">
        <p className="text-sm font-semibold text-brand">Kamera</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Kamera schließen"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="space-y-3 p-4">
        {/* 4:3 statt 16:9: Webcams liefern meist 4:3, und `object-contain`
            legte davon links und rechts breite schwarze Balken an – das Bild
            wäre schmaler als die Spalte, die es bekommt. */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-md border-2 border-border bg-black">
          <video
            ref={setVideoElement}
            playsInline
            muted
            className="size-full object-contain"
          />

          {/* Zielrahmen: sagt, wohin der Barcode gehalten werden soll. */}
          {status === "laeuft" ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[10%] inset-y-[32%] rounded-md border-2 border-gold/80"
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

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {treffer ? (
            <>
              Zuletzt erkannt: <span className="code">{treffer}</span>
            </>
          ) : (
            "Barcode formatfüllend vor die Kamera halten. Treffer wandern sofort auf den Bon."
          )}
        </p>
      </div>
    </aside>
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

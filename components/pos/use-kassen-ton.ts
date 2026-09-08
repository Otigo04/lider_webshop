"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Töne der Kasse.
 *
 * An der Kasse schaut niemand auf den Bildschirm, während er scannt – der
 * Blick liegt auf der Ware. Deshalb muss das Ohr unterscheiden können, was
 * gerade passiert ist: gebucht, unbekannt, angelegt, zu wenig Bestand,
 * fehlgeschlagen, fertig. Ein einziger Piep für alles hieße, jeden Vorgang
 * doch wieder am Bildschirm zu prüfen.
 *
 * Der vertraute Ladenpiep bleibt eine Tondatei – den kennt jeder, und er soll
 * klingen wie bisher. Alle übrigen Signale werden im Browser erzeugt: sie
 * brauchen keine weiteren Dateien, klingen auf jedem Gerät gleich und lassen
 * sich als Tonfolge sauber voneinander abgrenzen.
 */
export type KassenSignal =
  /** Artikel steht auf dem Bon / in der Liste */
  | "treffer"
  /** Code ohne Treffer – neue Ware, kein Fehler */
  | "unbekannt"
  /** Artikel wurde angelegt */
  | "neu"
  /** Vorgang möglich, aber nicht wie gewollt (Bestand reicht nicht) */
  | "warnung"
  /** Vorgang gescheitert */
  | "fehler"
  /** Verkauf beziehungsweise Lieferung gebucht */
  | "abschluss";

/** Liegt in `public/`, wird also unter diesem Pfad ausgeliefert. */
const TONDATEI = "/sounds/scanner-beep.mp3";

/**
 * Tonfolgen als [Frequenz in Hz, Dauer in ms].
 *
 * Die Richtung trägt die Bedeutung: aufwärts heißt „geschafft", abwärts
 * „steht noch aus", tief und lang „schiefgegangen". Wer eine Woche an der
 * Kasse steht, hört den Unterschied, ohne ihn gelernt zu haben.
 */
const FOLGEN: Record<Exclude<KassenSignal, "treffer">, [number, number][]> = {
  unbekannt: [
    [880, 90],
    [620, 150],
  ],
  neu: [
    [660, 80],
    [880, 80],
    [1170, 150],
  ],
  warnung: [
    [430, 110],
    [430, 190],
  ],
  fehler: [
    [200, 300],
    [160, 320],
  ],
  abschluss: [
    [784, 90],
    [988, 90],
    [1319, 210],
  ],
};

/** Pause zwischen zwei Tönen einer Folge. */
const LUECKE = 45;

export function useKassenTon() {
  const tonRef = useRef<HTMLAudioElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const ton = new Audio(TONDATEI);
    ton.preload = "auto";
    tonRef.current = ton;
    return () => {
      ton.pause();
      tonRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  /*
   * Der AudioContext entsteht erst beim ersten Signal: vor einer Eingabe des
   * Benutzers starten Browser ihn ohnehin angehalten. Danach lebt er weiter,
   * einen pro Ton zu bauen würde die Töne mit der Zeit verschlucken.
   */
  const kontext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Konstruktor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Konstruktor) return null;
      audioRef.current = new Konstruktor();
    }
    const ctx = audioRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }, []);

  return useCallback(
    (art: KassenSignal = "treffer") => {
      if (art === "treffer") {
        const ton = tonRef.current;
        if (!ton) return;
        // Zurückspulen: ohne das bliebe der nächste Artikel stumm, solange der
        // vorige Ton noch läuft.
        ton.currentTime = 0;
        // Scheitert die Wiedergabe – stummes Gerät, verweigerte Tonausgabe –,
        // wird trotzdem kassiert. Der Ton ist Rückmeldung, nicht Teil des
        // Vorgangs.
        void ton.play().catch(() => undefined);
        return;
      }

      const ctx = kontext();
      if (!ctx) return;

      let start = ctx.currentTime;
      for (const [frequenz, dauer] of FOLGEN[art]) {
        const laenge = dauer / 1000;
        const oszillator = ctx.createOscillator();
        const huelle = ctx.createGain();

        oszillator.type = "square";
        oszillator.frequency.value = frequenz;

        /*
         * Ein- und Ausblenden über wenige Millisekunden. Ohne diese Hüllkurve
         * knackt es bei jedem Ton hörbar – das Signal springt sonst von Null
         * auf volle Auslenkung.
         */
        huelle.gain.setValueAtTime(0.0001, start);
        huelle.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
        huelle.gain.exponentialRampToValueAtTime(0.0001, start + laenge);

        oszillator.connect(huelle).connect(ctx.destination);
        oszillator.start(start);
        oszillator.stop(start + laenge);

        start += laenge + LUECKE / 1000;
      }
    },
    [kontext],
  );
}

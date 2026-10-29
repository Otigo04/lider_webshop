import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  ermittleZustand,
  istAbgemeldet,
  istIosGeraet,
  loescheAbmeldung,
  merkeAbmeldung,
  urlBase64ToUint8Array,
} from "@/lib/push-client";

const basis = {
  hatPush: true,
  istIos: false,
  istInstalliert: false,
  erlaubnis: "default" as const,
  abonniert: false,
};

test("Zustand: iPhone ohne Installation geht vor 'nicht unterstützt'", () => {
  // Im Safari-Tab fehlt PushManager – trotzdem ist die Antwort 'installieren'.
  assert.equal(
    ermittleZustand({ ...basis, hatPush: false, istIos: true, istInstalliert: false }),
    "ios-installieren",
  );
});

test("Zustand: Browser ohne Push", () => {
  assert.equal(ermittleZustand({ ...basis, hatPush: false }), "nicht-unterstuetzt");
});

test("Zustand: installiertes iPhone, Erlaubnis offen", () => {
  assert.equal(
    ermittleZustand({ ...basis, istIos: true, istInstalliert: true }),
    "erlaubnis-offen",
  );
});

test("Zustand: im Browser blockiert", () => {
  assert.equal(ermittleZustand({ ...basis, erlaubnis: "denied" }), "blockiert");
});

test("Zustand: erlaubt und angemeldet ist aktiv", () => {
  assert.equal(ermittleZustand({ ...basis, erlaubnis: "granted", abonniert: true }), "aktiv");
});

test("Zustand: erlaubt, aber ohne Abo muss neu angemeldet werden", () => {
  assert.equal(
    ermittleZustand({ ...basis, erlaubnis: "granted", abonniert: false }),
    "erlaubnis-offen",
  );
});

test("iOS-Erkennung: iPhone, iPad mit Mac-Kennung, Mac ohne Touch", () => {
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)", plattform: "iPhone", touchPunkte: 5 }), true);
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", plattform: "MacIntel", touchPunkte: 5 }), true);
  assert.equal(istIosGeraet({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", plattform: "MacIntel", touchPunkte: 0 }), false);
});

test("VAPID-Schlüssel: base64url wird zu Bytes", () => {
  // 0xFB 0xFF → Standard-Base64 „+/8=" → URL-sicher ohne Auffüllung „-_8"
  assert.deepEqual([...urlBase64ToUint8Array("-_8")], [251, 255]);
  assert.deepEqual([...urlBase64ToUint8Array("AQID")], [1, 2, 3]);
});

// --- Abmelde-Merker (localStorage) -----------------------------------------

const urspruenglich = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function setzeSpeicher(wert: unknown) {
  Object.defineProperty(globalThis, "localStorage", { value: wert, configurable: true, writable: true });
}

function mapSpeicher() {
  const daten = new Map<string, string>();
  return {
    getItem: (k: string) => daten.get(k) ?? null,
    setItem: (k: string, v: string) => void daten.set(k, v),
    removeItem: (k: string) => void daten.delete(k),
  };
}

afterEach(() => {
  // Das globale localStorage nach jedem Test auf den Ausgangszustand zurück.
  if (urspruenglich) Object.defineProperty(globalThis, "localStorage", urspruenglich);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

test("Abmeldung: merken setzt den Merker, loeschen nimmt ihn weg", () => {
  setzeSpeicher(mapSpeicher());
  assert.equal(istAbgemeldet(), false);
  merkeAbmeldung();
  assert.equal(istAbgemeldet(), true);
  loescheAbmeldung();
  assert.equal(istAbgemeldet(), false);
});

test("Abmeldung: nur der Wert 1 gilt als abgemeldet", () => {
  const speicher = mapSpeicher();
  setzeSpeicher(speicher);
  speicher.setItem("lider-push-abgemeldet", "0");
  assert.equal(istAbgemeldet(), false);
});

test("Abmeldung: ein werfender Speicher bricht nichts ab", () => {
  const wirft = () => {
    throw new Error("gesperrt");
  };
  setzeSpeicher({ getItem: wirft, setItem: wirft, removeItem: wirft });
  assert.doesNotThrow(() => merkeAbmeldung());
  assert.doesNotThrow(() => loescheAbmeldung());
  assert.equal(istAbgemeldet(), false);
});

test("Abmeldung: ohne localStorage ist niemand abgemeldet", () => {
  setzeSpeicher(undefined);
  assert.equal(istAbgemeldet(), false);
  assert.doesNotThrow(() => merkeAbmeldung());
  assert.doesNotThrow(() => loescheAbmeldung());
});

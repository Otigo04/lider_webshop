/**
 * Formatprüfung für USt-IdNr. und deutsche Steuernummer.
 *
 * Nur das Format, keine Abfrage beim BZSt/VIES: eine Online-Prüfung bräuchte
 * einen externen Dienst und scheiterte an dessen Ausfällen genau dann, wenn
 * ein Kunde bestellen will. Die Prüfung soll Tippfehler und Leerangaben
 * fangen, nicht Betrug erkennen.
 *
 * Reine Funktion ohne Server-Importe: Konto-Formular, Checkout und Actions
 * rufen dieselbe Stelle.
 */

export type SteuernummerErgebnis =
  | { ok: true; art: "ustid" | "steuernr"; wert: string }
  | { ok: false; grund: string };

export function pruefeSteuernummer(eingabe: string): SteuernummerErgebnis {
  const roh = eingabe.trim();
  if (!roh) {
    return { ok: false, grund: "Die USt-IdNr. oder Steuernummer fehlt." };
  }

  // Leerzeichen, Bindestriche und Punkte sind Lesehilfen, kein Inhalt.
  const ohne = roh.replace(/[\s.-]/g, "").toUpperCase();

  if (/^DE\d{9}$/.test(ohne)) {
    return { ok: true, art: "ustid", wert: ohne };
  }
  if (/^DE/.test(ohne)) {
    return {
      ok: false,
      grund: "Deutsche USt-IdNr.: DE gefolgt von genau 9 Ziffern.",
    };
  }

  // Ländercode + 2–12 Zeichen, davon mindestens eine Ziffer: ohne die
  // Bedingung ginge ein Wort wie „keine" als USt-IdNr. durch.
  if (/^[A-Z]{2}(?=[A-Z0-9]*\d)[A-Z0-9]{2,12}$/.test(ohne)) {
    return { ok: true, art: "ustid", wert: ohne };
  }

  // Deutsche Steuernummer: 10 bis 13 Ziffern, je nach Bundesland mit
  // Schrägstrichen gegliedert (30/123/45678).
  const ziffern = ohne.replace(/\//g, "");
  if (/^[\d/]+$/.test(ohne) && /^\d{10,13}$/.test(ziffern)) {
    return { ok: true, art: "steuernr", wert: ohne };
  }

  return {
    ok: false,
    grund:
      "Bitte eine gültige USt-IdNr. (z. B. DE123456789) oder deutsche Steuernummer (z. B. 30/123/45678) angeben.",
  };
}

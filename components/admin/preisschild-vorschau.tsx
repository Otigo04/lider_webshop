"use client";

import { memo } from "react";
import { formatPrice } from "@/lib/format";
import {
  AKTIONSROT,
  CENT_ANTEIL,
  CODEROT,
  LABEL_LUFT,
  NAME_GEWICHT,
  NAME_ZEILE,
  PREIS_ABSTAND,
  SCHRIFT,
  fussAufteilung,
  fussHoehe,
  istReduziert,
  kennungTrenner,
  kopfHoehe,
  labelSchrift,
  nameBreite,
  nameSatz,
  preisAufteilung,
  preisTeile,
  schildMasse,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";

/**
 * Textbreite in em, gemessen mit derselben Schrift wie auf dem Papier. Ein
 * Canvas genügt – der Druckbogen misst im Browser genauso.
 */
let leinwand: CanvasRenderingContext2D | null = null;
function messen(text: string): number {
  if (typeof document === "undefined") return text.length * 0.55;
  leinwand ??= document.createElement("canvas").getContext("2d");
  if (!leinwand) return text.length * 0.55;
  leinwand.font = `${NAME_GEWICHT} 100px ${SCHRIFT}`;
  return leinwand.measureText(text).width / 100;
}

/**
 * Ein Preisschild in Originalgröße auf dem Bildschirm.
 *
 * Maße, Schriftgrößen und Farben kommen aus `lib/preisschild.ts` – denselben
 * Zahlen, aus denen der Druckbogen gebaut wird. Eine Vorschau mit eigenen
 * Werten wäre eine Zeichnung von einem Schild, kein Schild; sie soll aber
 * genau die Frage beantworten, wegen der man sie ansieht: passt die
 * Bezeichnung, oder rutscht sie ab?
 *
 * Deshalb auch Millimeter statt Tailwind-Klassen: der Browser rechnet sie in
 * dieselben Pixel um wie der Druckertreiber.
 */
export const PreisschildVorschau = memo(function PreisschildVorschau({
  schild,
  format,
  barcodePlatz = false,
}: {
  schild: Preisschild;
  format: SchildFormat;
  /**
   * Hält der Bogen Platz für Strichcodes frei? Die Entscheidung fällt für den
   * ganzen Bogen (siehe buildLabelSheetHtml) – hätte die Vorschau sie für
   * dieses eine Schild getroffen, zeigte sie bei einem Artikel ohne Barcode
   * einen größeren Preis als der Drucker liefert.
   */
  barcodePlatz?: boolean;
}) {
  const m = schildMasse(format, { barcode: barcodePlatz });
  const rot = istReduziert(schild);
  const { euro, cent } = preisTeile(schild.preis);
  const satz = nameSatz(schild.name, nameBreite(m, !!schild.icon), m.name, messen);

  // Fußzeile nach Rangfolge – dieselbe Rechnung wie im Druckbogen, damit die
  // Vorschau zeigt, was aus dem Drucker kommt.
  const { kennungGroesse, klartext, code, balken, kasten, labelGroesse: labelG } =
    fussAufteilung(schild, m);

  // Preiszeile nach Rangfolge – siehe preisAufteilung().
  const pa = preisAufteilung(schild, m);
  const unter = pa.anordnung === "unter";

  const trenner: React.CSSProperties = {
    height: `${m.linie}mm`,
    margin: `${m.linienLuft}mm 0`,
    background: "currentColor",
    opacity: 0.85,
    flex: "none",
  };

  return (
    <div
      // Der Rahmen gehört zur Vorschau, nicht zum Schild: auf dem Bogen steht
      // die Schnittlinie an dieser Stelle. Ohne ihn schwebte ein weißes Schild
      // vor weißem Hintergrund.
      className="shrink-0 overflow-hidden ring-1 ring-border"
      style={{
        width: `${format.breite}mm`,
        height: `${format.hoehe}mm`,
        padding: `${m.luft}mm`,
        background: rot ? AKTIONSROT : "#fff",
        // Weiß auf dem Aktionsrot, sonst Schwarz auf Weiß – auf #e2001a ist
        // der Kontrast zu Weiß deutlich höher als zu Schwarz.
        color: rot ? "#fff" : "#000",
        display: "flex",
        flexDirection: "column",
        fontFamily: SCHRIFT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: `${m.luft * 0.7}mm`,
          // Feste Höhe, damit der Preis nicht mit der Länge des Namens
          // auf und ab rutscht – siehe kopfHoehe().
          height: `${kopfHoehe(m)}mm`,
          flex: "none",
          overflow: "hidden",
        }}
      >
        {schild.icon ? (
          // Signed URL aus dem Storage, kein Optimierungsziel: das Symbol ist
          // wenige Kilobyte groß und steht nur in der Vorschau.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={schild.icon}
            alt=""
            style={{
              width: `${m.icon}mm`,
              height: `${m.icon}mm`,
              objectFit: "contain",
              flex: "none",
            }}
          />
        ) : null}
        {/* Zeilen fertig gesetzt aus nameSatz() – der Browser bricht hier
            nichts mehr selbst um, sonst sähe die Vorschau anders aus als der
            Bogen. */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: `${satz.groesse}mm`,
            fontWeight: NAME_GEWICHT,
            lineHeight: NAME_ZEILE,
            overflow: "hidden",
          }}
        >
          {satz.zeilen.map((zeile, i) => (
            <span key={i} style={{ display: "block", whiteSpace: "nowrap" }}>
              {zeile}
            </span>
          ))}
        </span>
      </div>

      <div style={trenner} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: unter ? "column" : "row",
            alignItems: unter ? "flex-start" : "center",
            gap: `${m.luft * (unter ? 0.45 : PREIS_ABSTAND)}mm`,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              fontSize: `${pa.groesse}mm`,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.035em",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "1em", lineHeight: 1 }}>{euro}</span>
            <span
              style={{
                fontSize: `${CENT_ANTEIL}em`,
                lineHeight: 1,
                marginLeft: "0.04em",
                letterSpacing: "-0.02em",
              }}
            >
              {cent}
            </span>
            <span
              style={{
                fontSize: `${CENT_ANTEIL}em`,
                lineHeight: 1,
                marginLeft: "0.14em",
                fontWeight: 600,
              }}
            >
              €
            </span>
          </div>

          {/* Streichpreis und Prozentfeld: rechts vom Preis untereinander oder
              – auf schmalen und hohen Schildern – in einer Reihe darunter. */}
          {pa.anordnung !== "solo" ? (
            <div
              style={{
                display: "flex",
                flexDirection: unter ? "row" : "column",
                alignItems: unter ? "center" : "flex-start",
                gap: `${m.luft * (unter ? PREIS_ABSTAND : 0.45)}mm`,
                flex: "none",
              }}
            >
              {pa.zeigeVorher && schild.vorher !== null ? (
                <span
                  style={{
                    fontSize: `${m.vorher * pa.nebenSkala}mm`,
                    lineHeight: 1,
                    fontWeight: 600,
                    textDecoration: "line-through",
                    textDecorationThickness: "0.1em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPrice(schild.vorher)}
                </span>
              ) : null}
              {pa.zeigeProzent && schild.prozent !== null ? (
                <span
                  style={{
                    fontSize: `${m.prozent * pa.nebenSkala}mm`,
                    fontWeight: 700,
                    lineHeight: 1,
                    padding: "0.22em 0.4em",
                    background: "#000",
                    color: "#fff",
                    whiteSpace: "nowrap",
                  }}
                >
                  −{schild.prozent}&nbsp;%
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div style={trenner} />

      {/* Fußzeile: Artikelnummer, Strichcode, Label. Feste Höhe, damit ein
          Schild ohne Code neben einem mit Code gleich hoch bleibt. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: `${m.luft * 0.7}mm`,
          height: `${fussHoehe(m)}mm`,
          flex: "none",
        }}
      >
        <span
          style={{
            fontSize: `${kennungGroesse}mm`,
            fontWeight: 600,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            flex: 1,
            minWidth: 0,
          }}
        >
          {schild.sku}
          {schild.code ? (
            <span style={{ color: rot ? "#fff" : CODEROT }}>#{schild.code}</span>
          ) : null}
          {/* Rückfall nur bei einer Nummer, die kein EAN ist. */}
          {klartext ? (
            <span style={{ opacity: 0.7, fontWeight: 500 }}>
              {kennungTrenner(schild.sku, schild.code) ? " · " : ""}
              {klartext}
            </span>
          ) : null}
        </span>

        {/* Weiße Fläche nur auf farbigem Grund – siehe Druckbogen. */}
        {code && balken && kasten ? (
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              flex: "none",
              boxSizing: "border-box",
              width: `${kasten.breite}mm`,
              height: `${kasten.hoehe}mm`,
              padding: `${kasten.rand}mm`,
              background: rot ? "#fff" : "transparent",
            }}
          >
            {code.abschnitte.map((a, i) => (
              <span
                key={i}
                style={{
                  display: "block",
                  height: "100%",
                  flex: "none",
                  width: `${a.module * balken.modul}mm`,
                  background: a.strich ? "#000" : "transparent",
                }}
              />
            ))}
          </div>
        ) : null}

        {schild.label && labelG > 0 ? (
          <span
            style={{
              fontSize: `${labelG}mm`,
              fontWeight: 700,
              lineHeight: 1,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              padding: `0.15em ${LABEL_LUFT / 2}em`,
              background: schild.label.farbe,
              color: labelSchrift(schild.label.farbe),
              whiteSpace: "nowrap",
              flex: "none",
            }}
          >
            {schild.label.name}
          </span>
        ) : null}
      </div>
    </div>
  );
});

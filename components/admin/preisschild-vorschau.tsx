"use client";

import { formatPrice } from "@/lib/format";
import {
  AKTIONSROT,
  CENT_ANTEIL,
  CODEROT,
  NAME_ZEILE,
  istReduziert,
  kennungSchriftgroesse,
  kopfHoehe,
  nebenblockBreite,
  preisSchriftgroesse,
  preisTeile,
  schildKennung,
  schildMasse,
  type Preisschild,
  type SchildFormat,
} from "@/lib/preisschild";

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
export function PreisschildVorschau({
  schild,
  format,
}: {
  schild: Preisschild;
  format: SchildFormat;
}) {
  const m = schildMasse(format);
  const rot = istReduziert(schild);
  const { euro, cent } = preisTeile(schild.preis);
  const kennung = schildKennung(schild.sku, schild.code);

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
        color: "#000",
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
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
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: `${m.name}mm`,
            fontWeight: 600,
            lineHeight: NAME_ZEILE,
            letterSpacing: "-0.015em",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {schild.name}
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
            alignItems: "center",
            gap: `${m.luft * 0.7}mm`,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              fontSize: `${preisSchriftgroesse(
                schild.preis,
                m,
                nebenblockBreite(schild.vorher, schild.prozent, m),
              )}mm`,
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

          {/* Streichpreis und Prozentfeld untereinander rechts vom Preis:
              zusammen in einer Reihe wären sie breiter als der Preis. */}
          {schild.vorher !== null || schild.prozent !== null ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: `${m.luft * 0.3}mm`,
                flex: "none",
              }}
            >
              {schild.vorher !== null ? (
                <span
                  style={{
                    fontSize: `${m.vorher}mm`,
                    fontWeight: 600,
                    textDecoration: "line-through",
                    textDecorationThickness: "0.1em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPrice(schild.vorher)}
                </span>
              ) : null}
              {schild.prozent !== null ? (
                <span
                  style={{
                    fontSize: `${m.prozent}mm`,
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

      <div
        style={{
          fontSize: `${kennungSchriftgroesse(kennung, m)}mm`,
          fontWeight: 600,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          flex: "none",
        }}
      >
        {schild.sku}
        {schild.code ? (
          <span style={{ color: rot ? "#000" : CODEROT }}>#{schild.code}</span>
        ) : null}
      </div>
    </div>
  );
}

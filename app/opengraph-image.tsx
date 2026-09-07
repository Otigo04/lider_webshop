import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Vorschaubild beim Teilen eines Links (WhatsApp, LinkedIn, Slack).
 *
 * Kein Foto, sondern ein schlichtes Schild in den Hausfarben: Wappenblau als
 * Fläche, Gold als Kante, dazu Logo und Sortiment. Ein Bild aus dem Katalog
 * wäre irreführend – geteilt wird meist die Startseite, nicht ein Artikel.
 * Artikelseiten haben ihr eigenes Vorschaubild.
 */

export const alt = "LIDER Berlin – Großhandel für Spielzeug, Multimedia und Handyzubehör";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function logoDataUri(): string | null {
  try {
    const datei = path.join(process.cwd(), "public", "logo", "logo.png");
    return `data:image/png;base64,${readFileSync(datei).toString("base64")}`;
  } catch {
    // Ohne Logodatei bleibt das Schild trotzdem lesbar.
    return null;
  }
}

export default async function Image() {
  const logo = logoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#131f3a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28, padding: "72px 80px 0" }}>
          {logo ? (
            /* ImageResponse rendert echtes <img>; next/image gibt es dort nicht. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={104} height={79} alt="" />
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 34,
              letterSpacing: 8,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            LIDER BERLIN
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "0 80px 64px" }}>
          <div style={{ display: "flex", fontSize: 24, color: "#e2a13f", letterSpacing: 3 }}>
            GROSSHANDEL FÜR GEWERBEKUNDEN
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 62,
              lineHeight: 1.1,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            Spielzeug, Multimedia und Handyzubehör
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#b3bdd2" }}>
            Staffelpreise und Bestände im Kundenportal · seit 2007 in Berlin
          </div>
        </div>

        <div style={{ display: "flex", height: 10, backgroundColor: "#b8721c" }} />
      </div>
    ),
    size,
  );
}

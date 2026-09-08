import { ImageResponse } from "next/og";
import { getPublicProduct } from "@/lib/queries/products";

/**
 * Vorschaubild einer Artikelseite: das Produktfoto mit Namen und Artikelnummer.
 *
 * Warum ein eigenes Bild und nicht einfach die Foto-URL in die Metadaten?
 * Die Fotos liegen in einem privaten Bucket und sind nur über Signed URLs
 * erreichbar, die nach einer Stunde ablaufen. Ein Link, den jemand morgen
 * teilt, hätte dann ein totes Vorschaubild. Diese Route liefert stattdessen
 * eine stabile Adresse und holt das Foto beim Erzeugen selbst.
 */

export const alt = "Artikel bei LIDER";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getPublicProduct(id);
  const foto = product?.imageUrls?.[0] ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#ffffff",
            padding: 32,
          }}
        >
          {foto ? (
            /* Volle Breite mit objectFit: contain – so zentriert das Bild sich
               selbst im Rahmen, statt an einer Kante zu kleben. ImageResponse
               rendert echtes <img>; next/image gibt es dort nicht. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto}
              width={1136}
              height={410}
              alt=""
              style={{ objectFit: "contain" }}
            />
          ) : (
            <div style={{ display: "flex", fontSize: 40, color: "#64748b" }}>
              LIDER
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#131f3a",
            borderTop: "10px solid #b8721c",
            padding: "28px 56px 34px",
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: "#e2a13f", letterSpacing: 3 }}>
            {product?.sku ?? "LIDER"}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 46,
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            {(product?.name ?? "Artikel").slice(0, 70)}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 24, color: "#b3bdd2" }}>
            Groß- und Einzelhandel · Staffelpreise im Kundenportal
          </div>
        </div>
      </div>
    ),
    size,
  );
}

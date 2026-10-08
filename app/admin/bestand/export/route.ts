import { requireAdmin } from "@/lib/auth";
import { baueBestandPdf } from "@/lib/bestand-pdf";
import { baueXlsx } from "@/lib/bestand-xlsx";
import { ohneEinkauf, sortiere } from "@/lib/bestand-export";
import { getBestandZeilen } from "@/lib/queries/bestand-export";

/**
 * Bestandsliste als Excel oder PDF.
 *
 *   GET /admin/bestand/export?format=xlsx|pdf&ek=1
 *
 * Route Handler, weil die Antwort eine Datei ist. Nur für Admins – mit `ek=1`
 * stehen Einkaufspreis und Warenwert drin, ohne werden sie schon hier aus den
 * Zeilen genommen, bevor ein Zeichner sie sieht.
 */

const TYPEN = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;

function meldung(text: string, status: number) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  await requireAdmin();

  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (format !== "xlsx" && format !== "pdf") {
    return meldung("Format fehlt: xlsx oder pdf.", 400);
  }
  const mitEk = params.get("ek") === "1";

  let zeilen;
  try {
    zeilen = sortiere(await getBestandZeilen());
  } catch (ursache) {
    console.error("[bestand] Export:", ursache);
    return meldung("Der Bestand konnte nicht geladen werden.", 500);
  }
  if (!mitEk) zeilen = ohneEinkauf(zeilen);

  const stand = new Date();
  const datei =
    format === "xlsx"
      ? await baueXlsx(zeilen, mitEk, stand)
      : await baueBestandPdf(zeilen, mitEk, stand);

  // Berliner Datum im Dateinamen, nicht das UTC-Datum des Servers.
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(stand);

  return new Response(new Uint8Array(datei), {
    headers: {
      "Content-Type": TYPEN[format],
      "Content-Disposition": `attachment; filename="Bestand_${tag}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}

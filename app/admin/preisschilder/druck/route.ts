import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { buildLabelSheetHtml } from "@/lib/preisschild-bogen";
import {
  MASS_GRENZEN,
  ghCode,
  schildPreis,
  type Preisschild,
} from "@/lib/preisschild";
import { getLabelIconDataUris } from "@/lib/queries/preisschilder";

/**
 * Druckbogen der Preisschilder.
 *
 * Route Handler statt Seite, aus demselben Grund wie beim Kassenbon: der Bogen
 * soll allein im Fenster stehen. Als Seite läge er unter dem Verwaltungslayout
 * und brächte Reiterleiste und Rahmen mit aufs Papier.
 *
 * POST statt GET, weil die Auswahl beliebig lang wird: fünfzig Artikel mit
 * Namen, Preisen und Symbolen sprengen jede Adresszeile. Die Werkbank schickt
 * ein Formular mit target="_blank" hierher.
 */

const MAX_SCHILDER = 1000;

const zeileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(40),
  preis: z.coerce.number().min(0).max(1_000_000),
  /** Streichpreis; ob daraus eine Reduzierung wird, entscheidet schildPreis(). */
  vorher: z.coerce.number().min(0).max(1_000_000).nullable(),
  /** Großhandelspreis in Euro – daraus wird der verdeckte Code. */
  gh: z.coerce.number().min(0).max(1_000_000).nullable(),
  iconId: z.string().uuid().nullable(),
  anzahl: z.coerce.number().int().min(1).max(500),
});

/**
 * Die Maße kommen mit, nicht die Kennung der Schildgröße.
 *
 * Sonst müsste die Route sie nachschlagen, und ein Bogen, der geöffnet wird,
 * nachdem jemand die Größe geändert oder gelöscht hat, käme in einem anderen
 * Maß aus dem Drucker als in der Vorschau stand.
 */
const formatSchema = z.object({
  name: z.string().trim().min(1).max(40),
  breite: z.coerce
    .number()
    .min(MASS_GRENZEN.min, `Die Breite muss mindestens ${MASS_GRENZEN.min} mm sein.`)
    .max(
      MASS_GRENZEN.maxBreite,
      `Die Breite darf höchstens ${MASS_GRENZEN.maxBreite} mm sein – breiter ist der Bogen nicht.`,
    ),
  hoehe: z.coerce
    .number()
    .min(MASS_GRENZEN.min, `Die Höhe muss mindestens ${MASS_GRENZEN.min} mm sein.`)
    .max(
      MASS_GRENZEN.maxHoehe,
      `Die Höhe darf höchstens ${MASS_GRENZEN.maxHoehe} mm sein – höher ist der Bogen nicht.`,
    ),
});

const bogenSchema = z.object({
  format: formatSchema,
  autoPrint: z.boolean().optional(),
  zeilen: z.array(zeileSchema).min(1, "Keine Schilder ausgewählt."),
});

export async function POST(request: Request) {
  await requireAdmin();

  const formData = await request.formData();
  const roh = formData.get("bogen");

  let geparst: unknown;
  try {
    geparst = JSON.parse(String(roh ?? ""));
  } catch {
    return new NextResponse("Ungültige Auswahl.", { status: 400 });
  }

  const parsed = bogenSchema.safeParse(geparst);
  if (!parsed.success) {
    return new NextResponse(parsed.error.issues[0].message, { status: 400 });
  }

  const { format, zeilen, autoPrint } = parsed.data;

  const gesamt = zeilen.reduce((summe, z) => summe + z.anzahl, 0);
  if (gesamt > MAX_SCHILDER) {
    return new NextResponse(
      `${gesamt} Schilder sind zu viel – höchstens ${MAX_SCHILDER} auf einmal.`,
      { status: 400 },
    );
  }

  const symbole = await getLabelIconDataUris(
    zeilen.map((z) => z.iconId).filter((id): id is string => id !== null),
  );

  // Erst das Schild bauen, dann vervielfältigen: die Rechenregeln laufen
  // einmal je Artikel und nicht einmal je Blatt Papier.
  const schilder: Preisschild[] = [];
  for (const zeile of zeilen) {
    const { preis, vorher, prozent } = schildPreis(zeile.preis, zeile.vorher);
    const schild: Preisschild = {
      name: zeile.name,
      preis,
      vorher,
      prozent,
      sku: zeile.sku,
      code: ghCode(zeile.gh),
      icon: zeile.iconId ? (symbole.get(zeile.iconId) ?? null) : null,
    };
    for (let i = 0; i < zeile.anzahl; i++) schilder.push(schild);
  }

  const html = buildLabelSheetHtml(schilder, {
    // Die Kennung braucht der Bogen nicht – er zeichnet nur, was er bekommt.
    format: { id: "druck", ...format },
    autoPrint: autoPrint !== false,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Ein Bogen wird einmal gedruckt und nie aus dem Cache geholt.
      "Cache-Control": "no-store",
    },
  });
}

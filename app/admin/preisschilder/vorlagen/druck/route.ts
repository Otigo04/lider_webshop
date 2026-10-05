import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { MASS_GRENZEN } from "@/lib/preisschild";
import { buildVorlagenSheetHtml } from "@/lib/preisschild-vorlagen-bogen";
import type { Vorlage } from "@/lib/preisschild-vorlagen";

/**
 * Druckbogen der Vorlagen-Schilder (ohne Preis).
 *
 * Route Handler und POST aus denselben Gründen wie
 * `/admin/preisschilder/druck`: der Bogen steht allein im Fenster, und die
 * Auswahl sprengt keine Adresszeile. Die Maße reisen mit, nicht die Kennung
 * der Schildgröße.
 */

const MAX_SCHILDER = 1000;

const zeileSchema = z.object({
  text: z.string().trim().min(1).max(40),
  zusatz: z.string().trim().max(60),
  farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  stil: z.enum(["flaeche", "rahmen"]),
  anzahl: z.coerce.number().int().min(1).max(500),
});

const bogenSchema = z.object({
  format: z.object({
    name: z.string().trim().min(1).max(40),
    breite: z.coerce.number().min(MASS_GRENZEN.min).max(MASS_GRENZEN.maxBreite),
    hoehe: z.coerce.number().min(MASS_GRENZEN.min).max(MASS_GRENZEN.maxHoehe),
  }),
  autoPrint: z.boolean().optional(),
  zeilen: z.array(zeileSchema).min(1, "Keine Schilder ausgewählt."),
});

export async function POST(request: Request) {
  await requireAdmin();

  const formData = await request.formData();
  let geparst: unknown;
  try {
    geparst = JSON.parse(String(formData.get("bogen") ?? ""));
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

  const schilder: Vorlage[] = [];
  for (const { anzahl, ...v } of zeilen) {
    for (let i = 0; i < anzahl; i++) schilder.push(v);
  }

  const html = buildVorlagenSheetHtml(schilder, {
    format: { id: "druck", ...format },
    autoPrint: autoPrint !== false,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

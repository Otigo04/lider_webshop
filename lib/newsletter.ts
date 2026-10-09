import { z } from "zod";

/**
 * Newsletter als Dokument: Betreff, Vorschautext und eine Liste von Bausteinen.
 * Gespeichert wird genau das (Migration 065, `newsletters.blocks`); das HTML
 * entsteht erst bei Vorschau und Versand (lib/newsletter-mail.ts). Ein Baustein
 * kennt weder Farben noch Maße – das Layout ist festgelegt, so sieht jeder
 * Newsletter wie LIDER aus, egal wer ihn zusammenklickt.
 *
 * Ohne Server-Importe: Editor und Versand lesen dieselben Schemata.
 */

const id = z.string().min(1).max(40);
const kurz = (max: number) => z.string().max(max);

export const blockSchema = z.discriminatedUnion("typ", [
  z.object({ id, typ: z.literal("ueberschrift"), text: kurz(160) }),
  z.object({ id, typ: z.literal("text"), text: kurz(4000) }),
  z.object({
    id,
    typ: z.literal("bild"),
    /** Pfad im Bucket products, unter newsletter/ */
    pfad: z.string().max(200).nullable(),
    alt: kurz(160),
    link: kurz(500),
  }),
  z.object({
    id,
    typ: z.literal("artikel"),
    ids: z.array(z.string().uuid()).max(12),
    preise: z.boolean(),
  }),
  z.object({
    id,
    typ: z.literal("auto"),
    quelle: z.enum(["neu", "reduziert", "topseller"]),
    anzahl: z.number().int().min(2).max(8),
    preise: z.boolean(),
  }),
  z.object({
    id,
    typ: z.literal("button"),
    text: kurz(60),
    url: kurz(500),
  }),
  z.object({
    id,
    typ: z.literal("hinweis"),
    ton: z.enum(["info", "aktion"]),
    text: kurz(600),
  }),
  z.object({ id, typ: z.literal("trenner") }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockTyp = Block["typ"];

export const dokumentSchema = z.object({
  betreff: z.string().trim().min(1, "Der Betreff fehlt").max(150, "Höchstens 150 Zeichen"),
  vorschautext: z.string().trim().max(200, "Höchstens 200 Zeichen"),
  blocks: z.array(blockSchema).max(60, "Höchstens 60 Bausteine"),
});

export type NewsletterDokument = z.infer<typeof dokumentSchema>;

export const BLOCK_NAMEN: Record<BlockTyp, string> = {
  ueberschrift: "Überschrift",
  text: "Text",
  bild: "Bild",
  artikel: "Ausgewählte Artikel",
  auto: "Artikel automatisch",
  button: "Knopf",
  hinweis: "Hinweiskasten",
  trenner: "Trennlinie",
};

export const AUTO_NAMEN = {
  neu: "Neuheiten",
  reduziert: "Reduzierte Ware",
  topseller: "Topseller",
} as const;

let zaehler = 0;
export function neueBlockId(): string {
  zaehler += 1;
  return `b${Date.now().toString(36)}${zaehler.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ein frischer Baustein dieses Typs. */
export function neuerBlock(typ: BlockTyp): Block {
  const basis = { id: neueBlockId() };
  switch (typ) {
    case "ueberschrift":
      return { ...basis, typ, text: "Neu bei LIDER" };
    case "text":
      return { ...basis, typ, text: "Liebe Kundinnen und Kunden,\n\nhier steht Ihr Text." };
    case "bild":
      return { ...basis, typ, pfad: null, alt: "", link: "" };
    case "artikel":
      return { ...basis, typ, ids: [], preise: true };
    case "auto":
      return { ...basis, typ, quelle: "neu", anzahl: 4, preise: true };
    case "button":
      return { ...basis, typ, text: "Zum Sortiment", url: "/shop" };
    case "hinweis":
      return { ...basis, typ, ton: "aktion", text: "Nur diese Woche: …" };
    case "trenner":
      return { ...basis, typ };
  }
}

/** Startdokument für einen neuen Newsletter. */
export function startDokument(): NewsletterDokument {
  return {
    betreff: "Neuheiten bei LIDER",
    vorschautext: "Frische Ware und aktuelle Angebote für Ihr Geschäft.",
    blocks: [
      { ...neuerBlock("ueberschrift"), text: "Neu im Sortiment" } as Block,
      neuerBlock("text"),
      neuerBlock("auto"),
      neuerBlock("button"),
    ],
  };
}

/**
 * Link aus dem Editor: „/shop“ gehört zur Website, alles andere muss mit
 * https:// (oder mailto:/tel:) beginnen. Alles Übrige gilt als ungültig und
 * wird nicht verlinkt – ein `javascript:` in einer Mail wäre ein Einfallstor.
 */
export function sichererLink(roh: string, basis: string): string | null {
  const wert = roh.trim();
  if (!wert) return null;
  if (wert.startsWith("/") && !wert.startsWith("//")) return `${basis}${wert}`;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(wert)) return wert;
  return null;
}

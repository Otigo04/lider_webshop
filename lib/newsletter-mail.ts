import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatPrice, toNumber } from "@/lib/format";
import { AUTO_NAMEN, sichererLink, type Block, type NewsletterDokument } from "@/lib/newsletter";
import { freeStock, reduzierung } from "@/lib/pricing";
import { istNeu } from "@/lib/product-flags";
import { siteUrl } from "@/lib/site";
import type { CompanySettings } from "@/lib/types";

/**
 * Newsletter als HTML-Mail.
 *
 * Tabellen und Inline-Stile, weil Mailprogramme (Outlook!) kein modernes CSS
 * lesen. Das Layout ist fest: weißes Blatt auf grauem Grund, Wappenblau und
 * Gold aus dem Logo, eine Schrift. Die Bausteine füllen es nur.
 *
 * Bilder laufen über /newsletter/bild (Weiterleitung auf eine frisch signierte
 * Adresse): die Fotos liegen in einem privaten Bucket, und eine signierte
 * Adresse, die in der Mail steht, wäre nach Stunden tot.
 */

const BLAU = "#284078";
const GOLD = "#b8721c";
const ROT = "#a02020";
const NAVY = "#131f3a";
const GRAU = "#5b6472";
const LINIE = "#e5e7eb";

/** Ersetzt sich beim Versand je Empfänger durch dessen Abmeldelink. */
export const ABMELDE_PLATZHALTER = "{{ABMELDEN}}";

export interface NewsletterProdukt {
  id: string;
  name: string;
  sku: string;
  hatBild: boolean;
  /** Anzeigepreis netto, null = kein Preis gepflegt */
  preis: number | null;
  /** Ab welcher Menge der Preis gilt (1 = ohne Angabe) */
  ab: number;
  reduziert: { prozent: number; vorher: number } | null;
}

export interface NewsletterInhalt {
  produkte: Map<string, NewsletterProdukt>;
  /** Treffer der automatischen Bausteine, je Baustein-Id */
  auto: Map<string, NewsletterProdukt[]>;
}

const SPALTEN = `id, sku, name, retail_price, list_price, stock_available, stock_reserved,
  is_active, is_new, is_topseller, created_at,
  variants:product_variants (min_quantity, unit_price),
  images:product_images (file_path, display_order)`;

interface Zeile {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string | null;
  list_price: number | string | null;
  stock_available: number;
  stock_reserved: number;
  is_active: boolean;
  is_new: boolean;
  is_topseller: boolean;
  created_at: string;
  variants: { min_quantity: number; unit_price: number | string }[];
  images: { file_path: string; display_order: number }[];
}

function zuProdukt(z: Zeile): NewsletterProdukt {
  const stufen = [...(z.variants ?? [])]
    .map((v) => ({ ab: v.min_quantity, preis: toNumber(v.unit_price) }))
    .filter((s) => s.preis > 0)
    .sort((a, b) => a.ab - b.ab);
  const laden = toNumber(z.retail_price) > 0 ? toNumber(z.retail_price) : null;
  const erste = stufen[0];
  const preis = erste?.preis ?? laden;
  const rd = erste
    ? reduzierung(z.list_price === null ? null : toNumber(z.list_price), erste.preis, laden)
    : null;
  return {
    id: z.id,
    name: z.name,
    sku: z.sku,
    hatBild: (z.images ?? []).length > 0,
    preis,
    ab: erste?.ab ?? 1,
    reduziert: rd ? { prozent: rd.prozent, vorher: rd.vorher } : null,
  };
}

/**
 * Lädt, was die Bausteine zeigen: die gewählten Artikel und die Treffer der
 * automatischen Bausteine. Auto-Treffer sind aktiv, lieferbar und haben ein
 * Foto – eine Mail, die ausverkaufte Ware bewirbt oder graue Kästen zeigt,
 * will niemand.
 */
export async function ladeNewsletterInhalt(
  supabase: SupabaseClient,
  blocks: Block[],
): Promise<NewsletterInhalt> {
  const produkte = new Map<string, NewsletterProdukt>();
  const auto = new Map<string, NewsletterProdukt[]>();

  const ids = [
    ...new Set(blocks.flatMap((b) => (b.typ === "artikel" ? b.ids : []))),
  ];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("products")
      .select(SPALTEN)
      .in("id", ids.slice(i, i + 100));
    if (error) console.error("[newsletter] Artikel:", error.message);
    for (const z of (data ?? []) as unknown as Zeile[]) produkte.set(z.id, zuProdukt(z));
  }

  const autoBloecke = blocks.filter((b) => b.typ === "auto");
  if (autoBloecke.length > 0) {
    const { data, error } = await supabase
      .from("products")
      .select(SPALTEN)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) console.error("[newsletter] Auto-Artikel:", error.message);

    const brauchbar = ((data ?? []) as unknown as Zeile[]).filter(
      (z) => freeStock(z) > 0 && (z.images ?? []).length > 0,
    );
    const jetzt = new Date();
    const rangReduziert = (z: Zeile) => zuProdukt(z).reduziert?.prozent ?? 0;

    for (const b of autoBloecke) {
      if (b.typ !== "auto") continue;
      const treffer =
        b.quelle === "neu"
          ? brauchbar.filter((z) => istNeu(z, jetzt))
          : b.quelle === "topseller"
            ? brauchbar.filter((z) => z.is_topseller)
            : brauchbar
                .filter((z) => rangReduziert(z) > 0)
                .sort((a, c) => rangReduziert(c) - rangReduziert(a));
      auto.set(b.id, treffer.slice(0, b.anzahl).map(zuProdukt));
    }
  }
  return { produkte, auto };
}

// --- Bausteine ---------------------------------------------------------------

function esc(wert: unknown): string {
  return String(wert ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fließtext: Absätze durch Leerzeilen, `**fett**` und `[Text](Adresse)`.
 * Erst wird alles maskiert, dann werden die zwei Auszeichnungen eingesetzt –
 * so kommt aus dem Text nie fremdes Markup in die Mail.
 */
export function formatiereText(text: string, basis: string): string {
  return esc(text)
    .split(/\n{2,}/)
    .map((absatz) => {
      const html = absatz
        .trim()
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
          const ziel = sichererLink(url.replace(/&amp;/g, "&"), basis);
          return ziel
            ? `<a href="${esc(ziel)}" style="color:${BLAU};text-decoration:underline;">${label}</a>`
            : label;
        })
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#374151;">${html}</p>`;
    })
    .join("");
}

function preisZeile(p: NewsletterProdukt, mitPreis: boolean): string {
  if (!mitPreis || p.preis === null) return "";
  const ab = p.ab > 1 ? `ab ${p.ab} Stk. ` : "";
  const alt = p.reduziert
    ? `<span style="color:#9aa1ad;text-decoration:line-through;font-weight:400;font-size:13px;">${esc(formatPrice(p.reduziert.vorher))}</span> `
    : "";
  return `<div style="margin-top:6px;font-size:15px;font-weight:700;color:${p.reduziert ? ROT : NAVY};">${alt}${esc(ab)}${esc(formatPrice(p.preis))} <span style="font-size:11px;font-weight:400;color:${GRAU};">netto</span></div>`;
}

function artikelRaster(liste: NewsletterProdukt[], mitPreis: boolean, basis: string): string {
  if (liste.length === 0) return "";
  const zellen = liste.map((p) => {
    const link = `${basis}/shop/product/${p.id}`;
    const bild = p.hatBild
      ? `<img src="${basis}/newsletter/bild?produkt=${p.id}" width="252" alt="${esc(p.name)}" style="display:block;width:100%;max-width:252px;height:auto;border:0;background:#f1f2f5;">`
      : `<div style="height:252px;background:#f1f2f5;"></div>`;
    const badge = p.reduziert
      ? `<div style="margin:0 0 6px;"><span style="display:inline-block;background:${ROT};color:#fff;font-size:12px;font-weight:700;padding:2px 7px;">−${p.reduziert.prozent} %</span></div>`
      : "";
    return `<td valign="top" width="50%" style="padding:0 8px 22px;">
      <a href="${esc(link)}" style="text-decoration:none;color:inherit;display:block;">
        ${bild}
        <div style="margin-top:10px;min-height:24px;">${badge}</div>
        <div style="font-size:14px;line-height:1.4;font-weight:700;color:${NAVY};">${esc(p.name)}</div>
        <div style="font-size:12px;color:${GRAU};margin-top:2px;">Art.-Nr. ${esc(p.sku)}</div>
        ${preisZeile(p, mitPreis)}
      </a>
    </td>`;
  });
  const zeilen: string[] = [];
  for (let i = 0; i < zellen.length; i += 2) {
    zeilen.push(`<tr>${zellen[i]}${zellen[i + 1] ?? `<td width="50%" style="padding:0 8px;"></td>`}</tr>`);
  }
  return `<table role="presentation" width="552" cellpadding="0" cellspacing="0" style="margin:0 0 0 -8px;width:552px;max-width:none;">${zeilen.join("")}</table>`;
}

function baustein(b: Block, inhalt: NewsletterInhalt, basis: string): string {
  switch (b.typ) {
    case "ueberschrift":
      return `<h2 style="margin:6px 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:${NAVY};">${esc(b.text)}</h2>`;
    case "text":
      return formatiereText(b.text, basis);
    case "bild": {
      if (!b.pfad) return "";
      const bild = `<img src="${basis}/newsletter/bild?p=${encodeURIComponent(b.pfad)}" width="536" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:536px;height:auto;border:0;">`;
      const ziel = sichererLink(b.link, basis);
      return `<div style="margin:6px 0 18px;">${ziel ? `<a href="${esc(ziel)}" style="text-decoration:none;">${bild}</a>` : bild}</div>`;
    }
    case "artikel": {
      const liste = b.ids.flatMap((id) => inhalt.produkte.get(id) ?? []);
      return `<div style="margin:6px 0 0;">${artikelRaster(liste, b.preise, basis)}</div>`;
    }
    case "auto": {
      const liste = inhalt.auto.get(b.id) ?? [];
      if (liste.length === 0) return "";
      return `<div style="margin:6px 0 0;">
        <div style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};">${esc(AUTO_NAMEN[b.quelle])}</div>
        ${artikelRaster(liste, b.preise, basis)}</div>`;
    }
    case "button": {
      const ziel = sichererLink(b.url, basis);
      if (!ziel || !b.text.trim()) return "";
      return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:10px auto 20px;"><tr><td style="background:${BLAU};border-radius:4px;"><a href="${esc(ziel)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(b.text)}</a></td></tr></table>`;
    }
    case "hinweis": {
      const aktion = b.ton === "aktion";
      return `<div style="margin:6px 0 18px;padding:14px 16px;background:${aktion ? "#fbf4ea" : "#eef2fa"};border-left:4px solid ${aktion ? GOLD : BLAU};font-size:15px;line-height:1.6;color:${NAVY};">${esc(b.text).replace(/\n/g, "<br>")}</div>`;
    }
    case "trenner":
      return `<div style="margin:14px 0 22px;border-top:1px solid ${LINIE};"></div>`;
  }
}

/**
 * Das fertige HTML. `abmeldeUrl` ist beim Versand der Platzhalter
 * ABMELDE_PLATZHALTER, in der Vorschau ein Blindlink.
 */
export function baueNewsletterHtml(opts: {
  dokument: NewsletterDokument;
  inhalt: NewsletterInhalt;
  firma: CompanySettings;
  /** null = persönliche Einzelmail an eine Adresse ohne Kundenkonto: kein Abmeldelink */
  abmeldeUrl: string | null;
  datum?: Date;
}): string {
  const basis = siteUrl();
  const { dokument: dok, firma } = opts;
  const inhalt = dok.blocks.map((b) => baustein(b, opts.inhalt, basis)).join("\n");
  const anschrift = [
    firma.company_name,
    firma.address_street,
    [firma.address_zip, firma.address_city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  const kontakt = [firma.phone, firma.email].filter(Boolean).map(esc).join(" · ");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(dok.betreff)}</title>
</head>
<body style="margin:0;padding:0;background:#eceef2;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(dok.vorschautext)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef2;padding:26px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;">
    <tr><td style="height:5px;background:${BLAU};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:22px 32px 18px;border-bottom:3px solid ${GOLD};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle"><a href="${basis}"><img src="${basis}/logo/logo_v1.png" width="92" alt="LIDER" style="display:block;border:0;height:auto;"></a></td>
        <td valign="middle" align="right" style="font-size:12px;color:${GRAU};line-height:1.5;">
          <span style="font-weight:700;color:${NAVY};letter-spacing:.08em;text-transform:uppercase;">Newsletter</span><br>
          Groß- und Einzelhandel<br>${esc(formatDate(opts.datum ?? new Date()))}
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 32px 10px;">
${inhalt}
    </td></tr>
    <tr><td style="padding:22px 32px 26px;background:#f6f7f9;border-top:1px solid ${LINIE};font-size:12px;line-height:1.7;color:${GRAU};">
      <strong style="color:${NAVY};">${anschrift}</strong><br>
      ${kontakt}${kontakt ? "<br>" : ""}
      <a href="${basis}/impressum" style="color:${GRAU};">Impressum</a> ·
      <a href="${basis}/datenschutz" style="color:${GRAU};">Datenschutz</a><br><br>
      ${
        opts.abmeldeUrl
          ? `Sie erhalten diese E-Mail, weil Sie den Newsletter in Ihrem Kundenkonto aktiviert haben.
      <a href="${opts.abmeldeUrl}" style="color:${BLAU};text-decoration:underline;">Newsletter abbestellen</a>`
          : "Diese E-Mail wurde Ihnen persönlich zugeschickt. Wenn Sie keine weiteren Nachrichten von uns wünschen, antworten Sie einfach auf diese Mail."
      }
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

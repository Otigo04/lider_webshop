/**
 * Texte unter der Überschrift der Sonderseiten im Shop (Migration 069).
 *
 * Die Standardtexte stehen hier, nicht in der Datenbank: eine Zeile in
 * `shop_texte` überschreibt sie, ohne Zeile gilt der Standard. So zeigt der
 * Shop auch dann einen Satz, wenn die Migration noch fehlt.
 */

export const SHOP_TEXT_KEYS = [
  "reduziert",
  "restposten",
  "neuheiten",
  "topseller",
] as const;
export type ShopTextKey = (typeof SHOP_TEXT_KEYS)[number];

export const SHOP_TEXT_MAX = 400;

export const SHOP_TEXT_STANDARD: Record<ShopTextKey, string> = {
  reduziert: "Artikel mit gesenktem Preis – solange der Vorrat reicht.",
  restposten:
    "B-Ware und Auslaufartikel, z. B. mit leicht beschädigter Verpackung – nur solange der Vorrat reicht.",
  neuheiten: "Zuletzt ins Sortiment aufgenommen.",
  topseller: "Artikel, die unsere Händler regelmäßig nachbestellen.",
};

export const SHOP_TEXT_LABELS: Record<ShopTextKey, string> = {
  reduziert: "Reduziert (/shop/reduziert)",
  restposten: "Restposten (/shop/restposten)",
  neuheiten: "Neuheiten (/shop/neuheiten)",
  topseller: "Topseller (/shop/topseller)",
};

/**
 * Öffentliche Basisadresse des Shops.
 *
 * Gebraucht an Stellen, die eine absolute URL brauchen und keinen Request
 * haben: Sitemap, Kanonische Links, Vorschaubilder beim Teilen. Relative
 * Pfade genügen dort nicht – ein Vorschaubild ohne Host lädt bei niemandem.
 *
 * Vercel setzt VERCEL_PROJECT_PRODUCTION_URL selbst; NEXT_PUBLIC_SITE_URL hat
 * Vorrang, damit die eigene Domain gewinnt, sobald sie eingetragen ist.
 */
export function siteUrl(): string {
  const eingetragen = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (eingetragen) return eingetragen.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

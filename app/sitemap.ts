import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/queries/sitemap";
import { siteUrl } from "@/lib/site";

/**
 * Sitemap über die öffentlich sichtbaren Seiten: Startseite, Rechtstexte,
 * Sortimentseinstiege und jede Artikelseite.
 *
 * Eine Stunde Vorhaltezeit: neue Artikel sollen zeitnah auftauchen, aber bei
 * jedem Abruf der Datei die ganze Artikeltabelle zu lesen, wäre für etwas,
 * das Suchmaschinen mehrmals täglich holen, verschwendet.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const basis = siteUrl();
  const jetzt = new Date();

  const feste: MetadataRoute.Sitemap = [
    { url: `${basis}/`, lastModified: jetzt, changeFrequency: "daily", priority: 1 },
    { url: `${basis}/shop`, lastModified: jetzt, changeFrequency: "daily", priority: 0.9 },
    { url: `${basis}/shop/neuheiten`, lastModified: jetzt, changeFrequency: "daily", priority: 0.7 },
    { url: `${basis}/shop/topseller`, lastModified: jetzt, changeFrequency: "weekly", priority: 0.7 },
    { url: `${basis}/versand`, lastModified: jetzt, changeFrequency: "yearly", priority: 0.4 },
    { url: `${basis}/impressum`, lastModified: jetzt, changeFrequency: "yearly", priority: 0.2 },
    { url: `${basis}/datenschutz`, lastModified: jetzt, changeFrequency: "yearly", priority: 0.2 },
  ];

  const katalog = await getSitemapEntries();

  return [
    ...feste,
    ...katalog.map((eintrag) => ({
      url: `${basis}${eintrag.pfad}`,
      lastModified: eintrag.geaendert,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

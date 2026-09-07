import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * Das Sortiment gehört in den Index.
 *
 * /shop ist bewusst auch ohne Login sichtbar (products_public: Name, Foto,
 * Beschreibung, "ab"-Preis – ohne Staffeln und Bestand, siehe
 * supabase/migrations/006_oeffentlicher_katalog.sql). Ein Händler, der nach
 * einem Artikel sucht, muss ihn finden können; sonst wäre der ganze
 * öffentliche Katalog umsonst gebaut.
 *
 * Gesperrt bleibt alles, was ohne Konto ohnehin nur eine Weiterleitung auf
 * /login ergibt, sowie die Formularseiten – die haben in Suchergebnissen
 * nichts verloren.
 */
export default function robots(): MetadataRoute.Robots {
  const basis = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/cart",
        "/checkout",
        "/orders",
        "/account",
        "/admin",
        "/kasse",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/willkommen",
        "/auth",
      ],
    },
    sitemap: `${basis}/sitemap.xml`,
    host: basis,
  };
}

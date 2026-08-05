import type { MetadataRoute } from "next";

/**
 * Nur Landingpage und Rechtstexte gehören in den Index. Das Kundenportal ist
 * ohnehin durch Login und RLS geschützt – der Ausschluss verhindert lediglich,
 * dass Suchmaschinen sinnlos auf Weiterleitungen laufen.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/shop",
        "/cart",
        "/checkout",
        "/orders",
        "/account",
        "/admin",
        "/login",
      ],
    },
  };
}

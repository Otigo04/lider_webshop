import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest. Es macht „Zum Home-Bildschirm“ auf dem iPhone zur eigenen
 * App – Voraussetzung dafür, dass iOS Web-Push überhaupt zustellt. Gestartet
 * wird im Admin; die Markenfarbe `--brand` (#284078) steht aus app/globals.css
 * hier fest, weil ein Manifest keine CSS-Variablen kennt.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIDER Admin",
    short_name: "LIDER",
    description: "Verwaltung und Benachrichtigungen des LIDER-Shops",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#284078",
    icons: [
      { src: "/logo/logo-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo/logo-mark.png", sizes: "480x480", type: "image/png" },
    ],
  };
}

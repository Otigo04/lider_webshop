import type { NextConfig } from "next";

// Host des Supabase-Projekts, damit next/image die Signed URLs laden darf.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    // Passend zur Gültigkeit der Signed URLs (lib/storage.ts): länger
    // vorzuhalten bringt nichts, weil die Bildadresse danach ohnehin wechselt.
    minimumCacheTTL: 12 * 60 * 60,
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Kein Einbetten in fremde Seiten – schützt vor Clickjacking auf
          // Warenkorb und Bestellformular.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Kein Rückfall auf HTTP mehr, sobald die Domain einmal geladen
          // wurde. Vercel liefert das ohnehin aus; hier steht es, damit es
          // auch bei einem Umzug auf einen anderen Anbieter gilt.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // `camera=(self)`, nicht `camera=()`: die Ladenkasse scannt Barcodes
          // über die Kamera. Eine leere Liste schaltet das Gerät für das
          // Dokument ab, noch bevor der Browser jemanden fragt – die Kasse
          // bekäme dann ewig NotAllowedError, egal was in den
          // Browsereinstellungen steht. Fremde Seiten, die uns einbetten,
          // erhalten weiterhin nichts.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

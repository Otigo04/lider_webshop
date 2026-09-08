import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ScrollProgress } from "@/components/scroll-progress";
import { CartProvider } from "@/lib/cart-context";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const TITEL = "LIDER – Groß- und Einzelhandel für Spielzeug, Multimedia, Handyzubehör";
const BESCHREIBUNG =
  "Groß- und Einzelhandel seit 2007: Spielzeug, Multimedia und Handyzubehör. Staffelpreise und aktuelle Bestände im Kundenportal für Gewerbekunden.";

export const metadata: Metadata = {
  /*
   * metadataBase macht aus den relativen Bildpfaden der Unterseiten absolute
   * URLs. Ohne diese Angabe liefert Next zwar Vorschau-Tags aus, aber mit
   * relativem Pfad – und den kann kein Messenger auflösen, die Karte bleibt
   * leer.
   */
  metadataBase: new URL(siteUrl()),
  title: { default: TITEL, template: "%s | LIDER" },
  description: BESCHREIBUNG,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "LIDER",
    title: TITEL,
    description: BESCHREIBUNG,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: TITEL,
    description: BESCHREIBUNG,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Kein h-full auf html: mit height:100% wächst die Seite auf iOS beim
    // Ein- und Ausblenden der Adressleiste mit und lässt sich weit über den
    // Inhalt hinaus scrollen. min-h-dvh am body rechnet mit der tatsächlich
    // sichtbaren Höhe und hat das Problem nicht.
    <html lang="de" className="antialiased">
      <head>
        {/*
         * Beim Scrollen eingeblendete Abschnitte starten unsichtbar und werden
         * per JavaScript sichtbar geschaltet (components/reveal.tsx). Ohne
         * JavaScript bliebe der halbe Seiteninhalt verborgen – deshalb hier
         * zurück auf sichtbar.
         */}
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh flex flex-col bg-background text-foreground">
        <CartProvider>
          {/*
            Sprungmarke für Tastatur und Screenreader: die Kopfleiste hat je
            nach Anmeldestatus bis zu zehn Links, die sonst vor jedem Seiten-
            inhalt erneut durchlaufen werden müssten. Sichtbar nur bei Fokus.
          */}
          <a
            href="#inhalt"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-gold-foreground"
          >
            Zum Inhalt springen
          </a>
          <Header />
          <ScrollProgress />
          <main id="inhalt" tabIndex={-1} className="flex-1">
            {children}
          </main>
          <Footer />
          <Toaster position="top-right" />
          <CookieBanner />
        </CartProvider>
      </body>
    </html>
  );
}

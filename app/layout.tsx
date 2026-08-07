import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { CartProvider } from "@/lib/cart-context";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LIDER Berlin – Großhandel für Spielzeug, Multimedia, Handyzubehör",
    template: "%s | LIDER Berlin",
  },
  description:
    "Großhandel aus Berlin seit 2007. Spielzeug, Multimedia und Handyzubehör mit Staffelpreisen und aktuellen Beständen im Kundenportal.",
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
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster position="top-right" />
          <CookieBanner />
        </CartProvider>
      </body>
    </html>
  );
}

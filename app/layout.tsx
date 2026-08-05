import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Lider Großhandel",
    template: "%s | Lider Großhandel",
  },
  description:
    "Großhandel für Gewerbekunden. Sortiment, Staffelpreise und Bestellung im Kundenportal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}

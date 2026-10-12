import type { Metadata } from "next";
import { SiteBannersSettings } from "@/components/forms/site-banners-settings";
import { getAllBanners } from "@/lib/queries/banners";

export const metadata: Metadata = { title: "Hinweisleiste" };

export default async function Seite() {
  const hinweise = await getAllBanners();

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">Hinweisleiste</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Die farbige Leiste ganz oben im Shop – für Versandkonditionen,
        Aktionen oder geänderte Öffnungszeiten. Stehen mehrere Hinweise
        aktiv, wechseln sie sich ab.
      </p>
      <div className="mt-6">
        <SiteBannersSettings
          banners={hinweise.banners}
          verfuegbar={hinweise.verfuegbar}
        />
      </div>
    </div>
  );
}

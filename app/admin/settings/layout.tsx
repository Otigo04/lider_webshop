import {
  EinstellungenNav,
  type EinstellungenEintrag,
} from "@/components/admin/einstellungen-nav";

const EINTRAEGE: EinstellungenEintrag[] = [
  {
    href: "/admin/settings",
    label: "Firmendaten",
    hinweis: "Absender, Steuer, Bank, Ladenkasse",
  },
  {
    href: "/admin/settings/oeffnungszeiten",
    label: "Öffnungszeiten",
    hinweis: "Laden, Abholung",
  },
  {
    href: "/admin/settings/hinweisleiste",
    label: "Hinweisleiste",
    hinweis: "Farbige Leiste ganz oben im Shop",
  },
  {
    href: "/admin/settings/texte",
    label: "Texte der Sonderseiten",
    hinweis: "Reduziert, Restposten, Neuheiten, Topseller",
  },
  {
    href: "/admin/settings/merkmale",
    label: "Merkmale",
    hinweis: "Farbe, Größe, Material – im Shop filterbar",
  },
  {
    href: "/admin/settings/flags",
    label: "Artikel-Flags",
    hinweis: "Eigene Kennzeichen, nur intern",
  },
  {
    href: "/admin/settings/impressum",
    label: "Impressum",
    hinweis: "Pflichtangaben unter /impressum",
  },
  {
    href: "/admin/settings/wartung",
    label: "Wartungsmodus",
    hinweis: "Wartungsseite für Besucher",
  },
];

export default function EinstellungenLayout({
  children,
}: LayoutProps<"/admin/settings">) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-12">
        <EinstellungenNav eintraege={EINTRAEGE} />
        <div className="min-w-0 max-w-2xl flex-1">{children}</div>
      </div>
    </div>
  );
}

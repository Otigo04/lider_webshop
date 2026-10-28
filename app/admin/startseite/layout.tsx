import {
  EinstellungenNav,
  type EinstellungenEintrag,
} from "@/components/admin/einstellungen-nav";

const EINTRAEGE: EinstellungenEintrag[] = [
  {
    href: "/admin/startseite",
    label: "Werbebilder Startseite",
    hinweis: "Bilder ganz oben auf der Startseite",
  },
  {
    href: "/admin/startseite/gruppen",
    label: "Banner der Warengruppen",
    hinweis: "Bilder oben auf der Seite einer Warengruppe",
  },
];

export default function StartseiteLayout({ children }: LayoutProps<"/admin/startseite">) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Startseite</h1>
      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-12">
        <EinstellungenNav eintraege={EINTRAEGE} label="Startseite und Banner" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

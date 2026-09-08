import { KasseTabs, type KasseTab } from "@/components/kasse/kasse-tabs";
import { requireAdmin } from "@/lib/auth";

/**
 * Kassen- und Buchhaltungsportal.
 *
 * Eigener Bereich neben der Verwaltung, nicht darin: am Tresen wird kassiert
 * und abgerechnet, in der Verwaltung werden Stammdaten gepflegt. Wer an der
 * Kasse steht, soll nicht an Warengruppen und Zugangsanfragen vorbeiscrollen.
 *
 * Die Rechteprüfung läuft wie im Adminbereich als Layout auf dem Server,
 * damit nichts ausgeliefert wird, bevor die Rolle feststeht.
 */

const KASSE_TABS: KasseTab[] = [
  { href: "/kasse", label: "Übersicht", icon: "uebersicht" },
  { href: "/kasse/terminal", label: "Kasse", icon: "kasse" },
  { href: "/kasse/verkaeufe", label: "Verkäufe", icon: "verkaeufe" },
  { href: "/kasse/umsaetze", label: "Umsätze", icon: "umsaetze" },
  {
    href: "/kasse/tagesabschluss",
    label: "Tagesabschluss",
    icon: "tagesabschluss",
  },
  { href: "/kasse/rechnungen", label: "Rechnungen", icon: "rechnungen" },
];

export default async function KasseLayout({ children }: LayoutProps<"/kasse">) {
  await requireAdmin();

  return (
    <div>
      <div className="bg-surface-dark text-surface-dark-foreground">
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <p className="eyebrow text-gold-bright">Kasse &amp; Buchhaltung</p>
          <div className="mt-3">
            <KasseTabs tabs={KASSE_TABS} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}

import Link from "next/link";
import { Heart, Percent, Sparkles, TrendingUp } from "lucide-react";
import { accentIndex } from "@/lib/accent-colors";
import { cn } from "@/lib/utils";

/**
 * Schnellleiste über dem Kopfbereich der Startseite.
 *
 * Dieselben Wege wie im Klappmenü, aber ohne es erst öffnen zu müssen – auf
 * dem Handy ist das Menü sonst der einzige Weg zu Reduziert oder Topseller.
 * Danach die Warengruppen, jeweils mit ihrem Farbpunkt aus der Filterspalte.
 *
 * Eine Zeile, seitlich schiebbar statt umbrechend: zwei oder drei Zeilen
 * Knöpfe schöben das Schaufenster aus dem ersten Bild.
 */
export function Schnellleiste({
  warengruppen,
}: {
  warengruppen: { slug: string; name: string }[];
}) {
  const wege = [
    { href: "/shop/reduziert", label: "Reduziert", icon: Percent, ton: "text-signal" },
    { href: "/shop/topseller", label: "Topseller", icon: TrendingUp, ton: "text-gold" },
    { href: "/shop/neuheiten", label: "Neuheiten", icon: Sparkles, ton: "text-brand" },
    { href: "/merkliste", label: "Merkliste", icon: Heart, ton: "text-signal" },
  ];
  const service = [
    { href: "/shop", label: "Alle Artikel" },
    { href: "/faq", label: "FAQ" },
    { href: "/kontakt", label: "Kontakt" },
  ];

  const chip =
    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-muted";

  return (
    <nav aria-label="Schnellzugriff" className="border-b border-border bg-muted/60">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {wege.map(({ href, label, icon: Icon, ton }) => (
          <Link key={href} href={href} className={chip}>
            <Icon className={cn("size-3.5", ton)} aria-hidden />
            {label}
          </Link>
        ))}

        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-border" />

        {warengruppen.map((gruppe) => (
          <Link key={gruppe.slug} href={`/shop/${gruppe.slug}`} className={chip}>
            <span
              aria-hidden
              className={cn("size-2 rounded-full", `tag-dot-${accentIndex(gruppe.slug)}`)}
            />
            {gruppe.name}
          </Link>
        ))}

        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-border" />

        {service.map(({ href, label }) => (
          <Link key={href} href={href} className={cn(chip, "text-muted-foreground")}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

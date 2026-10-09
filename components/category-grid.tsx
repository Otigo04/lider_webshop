import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import { accentIndex } from "@/lib/accent-colors";
import { cn } from "@/lib/utils";
import type { LandingCategory } from "@/lib/queries/products";

/**
 * Warengruppen als farbige Kacheln im Raster.
 *
 * Löst die Bildreihe ab, die nur zeigte, was hineinpasste, und bei Gruppen
 * ohne Kachelbild eine leere Fläche mit durchgestrichenem Bildsymbol stellte.
 * Hier liegt alles auf einen Blick: Name, Artikelzahl und – wenn kein eigenes
 * Kachelbild gepflegt ist – drei Fotos aus der Gruppe selbst.
 *
 * Die Fläche trägt die Warengruppenfarbe aus lib/accent-colors.ts, dieselbe
 * wie in Filterspalte und Artikelliste.
 */
export function CategoryGrid({ categories }: { categories: LandingCategory[] }) {
  if (categories.length === 0) return null;

  return (
    // Höchstens drei Spalten: die Kacheln sollen Fläche haben und als
    // Einstieg ins Sortiment auffallen, nicht als Fußnote unter dem Kopf.
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
      {categories.map((category) => (
        <li key={category.id}>
          <Kachel category={category} />
        </li>
      ))}
    </ul>
  );
}

function Kachel({ category }: { category: LandingCategory }) {
  const farbe = accentIndex(category.slug);

  return (
    <Link
      href={`/shop/${category.slug}`}
      className={cn(
        "card-hover group relative flex h-full min-h-[14rem] flex-col overflow-hidden rounded-xl p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:min-h-[18rem] sm:p-6 lg:min-h-[22rem]",
        `tag-${farbe}`,
      )}
    >
      {/* Heller Kreis als Bühne hinter den Bildern – gibt der Fläche Tiefe,
          ohne ein weiteres Farbelement einzuführen. */}
      <span
        aria-hidden
        className="absolute -bottom-20 -right-14 size-56 rounded-full bg-white/45 transition-transform duration-700 group-hover:scale-110 sm:size-80"
      />

      <div className="relative z-10">
        <p className="text-lg font-bold leading-tight sm:text-2xl lg:text-[1.7rem]">
          {category.name}
        </p>
        <p className="mt-1.5 text-xs font-medium opacity-80 tabular sm:text-sm">
          {category.productCount > 0
            ? `${category.productCount} Artikel`
            : "Noch keine Artikel"}
        </p>
      </div>

      <div className="relative z-10 mt-auto flex items-end justify-between gap-2 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/70 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white sm:size-11">
          <ArrowRight className="size-4 sm:size-5" aria-hidden />
        </span>

        {category.imageUrl ? (
          <span className="relative block size-28 overflow-hidden rounded-lg bg-white shadow-md sm:size-40 md:size-48 lg:size-60">
            <Image
              src={category.imageUrl}
              alt=""
              fill
              sizes="(min-width: 1024px) 240px, (min-width: 768px) 192px, (min-width: 640px) 160px, 112px"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          </span>
        ) : category.vorschau.length > 0 ? (
          <span className="fan relative flex h-[4.5rem] items-end sm:h-28 md:h-32 lg:h-36">
            {category.vorschau.map((url, index) => (
              <span
                key={url}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-md border-2 border-white bg-white shadow-md sm:size-24 md:size-28 lg:size-32",
                  index > 0 && "-ml-7 sm:-ml-8 md:-ml-12 lg:-ml-16",
                  index === 1 && "z-10 -translate-y-1.5",
                )}
              >
                <Image src={url} alt="" fill sizes="(min-width: 1024px) 128px, (min-width: 768px) 112px, (min-width: 640px) 96px, 64px" className="object-contain p-1" />
              </span>
            ))}
          </span>
        ) : (
          <Boxes className="size-10 opacity-40 sm:size-16" aria-hidden />
        )}
      </div>
    </Link>
  );
}

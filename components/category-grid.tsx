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
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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
        "card-hover group relative flex h-full min-h-[11rem] flex-col overflow-hidden rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:min-h-[13rem] sm:p-5",
        `tag-${farbe}`,
      )}
    >
      {/* Heller Kreis als Bühne hinter den Bildern – gibt der Fläche Tiefe,
          ohne ein weiteres Farbelement einzuführen. */}
      <span
        aria-hidden
        className="absolute -bottom-16 -right-12 size-48 rounded-full bg-white/45 transition-transform duration-700 group-hover:scale-110"
      />

      <div className="relative z-10">
        <p className="text-base font-bold leading-tight sm:text-lg">
          {category.name}
        </p>
        <p className="mt-1 text-xs font-medium opacity-80 tabular">
          {category.productCount} Artikel
        </p>
      </div>

      <div className="relative z-10 mt-auto flex items-end justify-between gap-2 pt-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/70 transition-all duration-300 group-hover:translate-x-1 group-hover:bg-white">
          <ArrowRight className="size-4" aria-hidden />
        </span>

        {category.imageUrl ? (
          <span className="relative block size-24 overflow-hidden rounded-md bg-white shadow-md sm:size-28">
            <Image
              src={category.imageUrl}
              alt=""
              fill
              sizes="112px"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          </span>
        ) : category.vorschau.length > 0 ? (
          <span className="fan relative flex h-20 items-end sm:h-24">
            {category.vorschau.map((url, index) => (
              <span
                key={url}
                className={cn(
                  "relative block size-14 overflow-hidden rounded-md border-2 border-white bg-white shadow-md sm:size-16",
                  index > 0 && "-ml-5",
                  index === 1 && "z-10 -translate-y-1.5",
                )}
              >
                <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" />
              </span>
            ))}
          </span>
        ) : (
          <Boxes className="size-10 opacity-40" aria-hidden />
        )}
      </div>
    </Link>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { accentIndex } from "@/lib/accent-colors";
import { cn } from "@/lib/utils";
import type { LandingCategory } from "@/lib/queries/products";

/**
 * Warengruppen als Bildkacheln über dem Sortiment.
 *
 * Ein Einkäufer sucht zuerst die Ecke des Sortiments, die ihn angeht, und
 * erkennt sie am Bild schneller als am Wort. Deshalb steht die Reihe über den
 * Einzelartikeln und nicht als Liste daneben.
 *
 * Gescrollt wird nativ mit Scroll-Snap: die Pfeile schieben nur um eine
 * Kachelbreite weiter. Ein Karussell mit eigenem Zustand würde ohne
 * JavaScript gar nichts zeigen und auf dem Telefon das Wischen abwürgen –
 * hier funktioniert beides, mit und ohne Pfeile.
 *
 * Der Farbbalken unten trägt die Farbe der Warengruppe (lib/accent-colors.ts),
 * dieselbe wie in Filterspalte und Kachelliste. Er ist die Verbindung zwischen
 * den Ansichten, kein Zierstreifen.
 */
export function CategoryCarousel({
  categories,
}: {
  categories: LandingCategory[];
}) {
  const bahnRef = useRef<HTMLUListElement>(null);
  const [links, setLinks] = useState(false);
  const [rechts, setRechts] = useState(false);

  /*
   * Pfeile nur zeigen, wenn es in diese Richtung überhaupt weitergeht. Ein
   * Pfeil, der nichts tut, ist schlimmer als keiner: er verspricht Inhalt,
   * den es nicht gibt.
   */
  const grenzenPruefen = useCallback(() => {
    const bahn = bahnRef.current;
    if (!bahn) return;
    const rest = bahn.scrollWidth - bahn.clientWidth - bahn.scrollLeft;
    setLinks(bahn.scrollLeft > 8);
    setRechts(rest > 8);
  }, []);

  useEffect(() => {
    grenzenPruefen();
    const bahn = bahnRef.current;
    if (!bahn) return;
    window.addEventListener("resize", grenzenPruefen);
    return () => window.removeEventListener("resize", grenzenPruefen);
  }, [grenzenPruefen, categories.length]);

  function schieben(richtung: -1 | 1) {
    const bahn = bahnRef.current;
    if (!bahn) return;
    // Eine Kachelbreite plus Abstand; bei schmalen Bahnen höchstens die
    // sichtbare Breite, sonst spränge die Reihe an der Auswahl vorbei.
    const kachel = bahn.firstElementChild as HTMLElement | null;
    const schritt = Math.min(
      (kachel?.offsetWidth ?? 260) + 16,
      bahn.clientWidth,
    );
    bahn.scrollBy({ left: richtung * schritt, behavior: "smooth" });
  }

  if (categories.length === 0) return null;

  return (
    <div className="relative">
      <ul
        ref={bahnRef}
        onScroll={grenzenPruefen}
        // overscroll-x-contain: das Wischen bleibt in der Reihe und schiebt
        // nicht die Seite mit, wenn das Ende erreicht ist.
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((category) => (
          <li
            key={category.id}
            className="w-[15rem] shrink-0 snap-start sm:w-[16rem] lg:w-[17rem]"
          >
            <KategorieKachel category={category} />
          </li>
        ))}
      </ul>

      <Pfeil
        richtung="links"
        sichtbar={links}
        onClick={() => schieben(-1)}
      />
      <Pfeil
        richtung="rechts"
        sichtbar={rechts}
        onClick={() => schieben(1)}
      />
    </div>
  );
}

function KategorieKachel({ category }: { category: LandingCategory }) {
  const farbe = accentIndex(category.slug);

  return (
    <Link
      href={`/shop/${category.slug}`}
      className="card-hover group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="relative aspect-square bg-muted">
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 272px, 60vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          /* Ohne Bild bleibt die Kachel eine Kachel: gleiche Größe, Farbe der
             Warengruppe als Fläche. Ein Loch im Raster sähe nach Fehler aus. */
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center opacity-15",
              `tag-dot-${farbe}`,
            )}
          >
            <ImageOff className="size-8 text-foreground" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-center px-4 py-4 text-center">
        <p className="font-semibold leading-snug group-hover:underline">
          {category.name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular">
          {category.productCount}{" "}
          {category.productCount === 1 ? "Artikel" : "Artikel"}
        </p>
      </div>

      <span aria-hidden className={cn("h-1.5 w-full", `tag-dot-${farbe}`)} />
    </Link>
  );
}

function Pfeil({
  richtung,
  sichtbar,
  onClick,
}: {
  richtung: "links" | "rechts";
  sichtbar: boolean;
  onClick: () => void;
}) {
  const Icon = richtung === "links" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      // aria-hidden samt tabIndex -1: die Kacheln sind Links und über die
      // Tabulatortaste ohnehin alle erreichbar – der Pfeil wäre ein zweiter
      // Weg zum selben Ziel und für Screenreader nur Lärm.
      aria-hidden
      tabIndex={-1}
      className={cn(
        // Innerhalb der Bahn, nicht daneben: außerhalb ragten die Knöpfe über
        // den Seitenrand hinaus und machten die ganze Seite seitlich
        // scrollbar.
        "absolute top-[38%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur-sm transition-opacity duration-200 hover:bg-muted sm:flex",
        richtung === "links" ? "left-2" : "right-2",
        sichtbar ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

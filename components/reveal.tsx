"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Blendet den Inhalt ein, sobald er in den Sichtbereich scrollt.
 *
 * Die Klasse wird bewusst direkt am DOM-Knoten gesetzt statt über State: das
 * spart einen Rerender pro Element, und rückgängig gemacht wird ohnehin nie.
 *
 * Ohne JavaScript bliebe der Inhalt unsichtbar – dagegen steht die
 * noscript-Regel in app/layout.tsx. `prefers-reduced-motion` schaltet die
 * Bewegung in globals.css ab, der Inhalt erscheint dann sofort.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Versatz in Millisekunden, für gestaffelte Listen */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        element.classList.add("is-visible");
        observer.disconnect();
      },
      // Erst einblenden, wenn das Element ein Stück im Bild ist – sonst ist die
      // Animation am unteren Rand schon vorbei, bevor man hinsieht.
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

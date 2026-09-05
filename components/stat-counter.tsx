"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zählt eine Zahl beim Sichtbarwerden von 0 auf ihren Zielwert hoch.
 *
 * Läuft nur einmal (IntersectionObserver trennt nach dem ersten Treffer), und
 * respektiert prefers-reduced-motion, indem der Zielwert dann sofort steht.
 */
export function StatCounter({
  value,
  suffix = "",
  duration = 1100,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        // Die Abfrage steht hier und nicht im Effektrumpf: dort wäre es ein
        // setState mitten im Rendern, hier läuft sie ohnehin erst, wenn die
        // Zahl sichtbar wird.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setDisplay(value);
          return;
        }

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className="stat-counter tabular">
      {display.toLocaleString("de-DE")}
      {suffix}
    </span>
  );
}

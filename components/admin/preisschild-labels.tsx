"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { setLabelFarbe } from "@/lib/actions/preisschilder";
import { labelSchrift, type LabelOption } from "@/lib/preisschild";

/**
 * Farben der Labels auf den Preisschildern.
 *
 * Die Labels selbst kommen aus dem Bestand – „Neu", „Topseller" und die
 * Artikel-Flags aus den Einstellungen. Hier wird nur die Farbe gewählt, und
 * die gilt ab dann für jedes Schild. Neue Labels entstehen deshalb unter
 * /admin/settings als Artikel-Flag, nicht hier: ein zweiter Ort zum Anlegen
 * hieße zwei Listen, die auseinanderlaufen.
 *
 * Der Farbwähler meldet beim Ziehen jede Zwischenfarbe. Gespeichert wird erst,
 * wenn er eine halbe Sekunde stillsteht – sonst gingen Dutzende Anfragen raus.
 */
export function PreisschildLabels({
  labels,
  onFarbe,
}: {
  labels: LabelOption[];
  onFarbe: (key: string, farbe: string) => void;
}) {
  const zeitgeber = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function aendern(key: string, farbe: string) {
    onFarbe(key, farbe);
    const alt = zeitgeber.current.get(key);
    if (alt) clearTimeout(alt);
    zeitgeber.current.set(
      key,
      setTimeout(async () => {
        zeitgeber.current.delete(key);
        const ergebnis = await setLabelFarbe({ key, farbe });
        if (ergebnis.error) toast.error(ergebnis.error);
      }, 500),
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Labels</h2>
      <p className="text-xs text-muted-foreground">
        Stehen unten rechts auf dem Schild. Farbe anklicken zum Ändern – sie
        wird gespeichert. Weitere Labels unter Einstellungen → Artikel-Flags.
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {labels.map((label) => (
          <li key={label.key}>
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border py-1 pl-1 pr-2 hover:bg-muted"
              title={`Farbe für „${label.name}" wählen`}
            >
              <span
                className="rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
                style={{ background: label.farbe, color: labelSchrift(label.farbe) }}
              >
                {label.name}
              </span>
              <input
                type="color"
                value={label.farbe}
                onChange={(event) => aendern(label.key, event.target.value)}
                className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={`Farbe für „${label.name}"`}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

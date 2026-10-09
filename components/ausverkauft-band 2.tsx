import { cn } from "@/lib/utils";

/**
 * „AUSVERKAUFT" quer über dem unteren Rand eines Fotos.
 *
 * Der Artikel bleibt sichtbar – wer ihn kennt, soll sehen, dass es ihn gibt
 * und dass er nur gerade nicht lieferbar ist. Das Foto darunter wird dafür nur
 * abgedunkelt (siehe `ausverkauftBild`), nicht ersetzt. Der Text trägt die
 * Aussage allein, die Farbe unterstützt nur.
 */
export function AusverkauftBand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 bg-destructive py-1.5 text-center text-sm font-extrabold uppercase tracking-widest text-white",
        className,
      )}
    >
      Ausverkauft
    </span>
  );
}

/** Klassen für das Foto eines ausverkauften Artikels: gedämpft, aber erkennbar. */
export const ausverkauftBild = "opacity-60 saturate-50";

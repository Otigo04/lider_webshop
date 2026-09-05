import { formatPrice } from "@/lib/format";
import type { Reduzierung } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Preisblock eines reduzierten Artikels.
 *
 * Der neue Preis trägt die Signalfarbe des Logos, der alte steht
 * durchgestrichen daneben, die Ersparnis als Prozentbadge. Drei Angaben statt
 * einer – rot allein wäre für die Farbfehlsichtigen kein Unterschied.
 *
 * Ohne Reduzierung wird die Komponente gar nicht erst gerendert; der
 * Aufrufende prüft `reduzierung()` aus lib/pricing.ts.
 */
/**
 * Drei Größen für drei Orte: die Artikelseite hat Platz, die Karte im
 * Sortiment weniger, die kompakte Kachel der Startseite am wenigsten.
 */
type Groesse = "kompakt" | "normal" | "gross";

const NEUER_PREIS: Record<Groesse, string> = {
  kompakt: "text-lg",
  normal: "text-xl",
  gross: "text-3xl",
};

const ALTER_PREIS: Record<Groesse, string> = {
  kompakt: "text-xs",
  normal: "text-sm",
  gross: "text-base",
};

export function SalePrice({
  reduktion,
  suffix,
  groesse = "normal",
  className,
}: {
  reduktion: Reduzierung;
  /** Zusatz hinter dem Preis, z. B. "/ Stück" */
  suffix?: string;
  groesse?: Groesse;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-bold tabular text-signal", NEUER_PREIS[groesse])}>
        {formatPrice(reduktion.jetzt)}
      </span>
      {suffix ? (
        <span className="text-xs text-muted-foreground">{suffix}</span>
      ) : null}
      <span
        className={cn(
          "tabular text-muted-foreground line-through",
          ALTER_PREIS[groesse],
        )}
      >
        {formatPrice(reduktion.vorher)}
      </span>
      <RabattBadge prozent={reduktion.prozent} />
    </div>
  );
}

/** Prozentbadge allein – für Bildecken und Listenzeilen. */
export function RabattBadge({
  prozent,
  className,
}: {
  prozent: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-signal px-1.5 py-0.5 text-xs font-semibold text-signal-foreground",
        className,
      )}
    >
      −{prozent}&nbsp;%
    </span>
  );
}

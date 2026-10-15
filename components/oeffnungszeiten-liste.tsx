import { formatOeffnungszeiten, type Oeffnungszeiten } from "@/lib/oeffnungszeiten";

/** Öffnungszeiten als Zeilenliste, gleiche Zeiten zusammengefasst. */
export function OeffnungszeitenListe({
  zeiten,
  className,
}: {
  zeiten: Oeffnungszeiten;
  className?: string;
}) {
  return (
    <ul className={className}>
      {formatOeffnungszeiten(zeiten).map((zeile) => (
        <li key={zeile} className="tabular">
          {zeile}
        </li>
      ))}
    </ul>
  );
}

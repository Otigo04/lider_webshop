"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KatalogArtikelSuche } from "@/components/admin/katalog-artikel-suche";
import { KatalogEinstellungenFeld } from "@/components/admin/katalog-einstellungen";
import { KatalogZusammenstellung } from "@/components/admin/katalog-zusammenstellung";
import {
  addKatalogArtikel,
  removeKatalogArtikel,
  setKatalogReihenfolge,
  updateKatalogFeld,
  type KatalogFeld,
} from "@/lib/actions/kataloge";
import type { AdminFormState } from "@/lib/actions/admin-categories";
import {
  katalogAufbau,
  type KatalogArtikel,
  type KatalogEinstellungen,
} from "@/lib/katalog";

/**
 * Werkbank des Kataloggenerators: links Artikel finden, in der Mitte die
 * Zusammenstellung, rechts Einstellungen und Ausgabe.
 *
 * Es gibt keinen Speichern-Knopf. Jede Änderung steht sofort in der
 * Oberfläche und geht im selben Zug an den Server; scheitert das, wird sie
 * zurückgenommen und gemeldet. Ein Katalog entsteht über eine halbe Stunde
 * verteilt – ein vergessener Klick auf „Speichern" wäre die ganze halbe
 * Stunde.
 *
 * Seitenzahl und Warnungen kommen aus katalogAufbau(), derselben Funktion,
 * die auch den Bogen umbricht. Was hier steht, steht auf dem Papier.
 */
export function KatalogWerkbank({
  id,
  einstellungen,
  productIds,
  artikel,
}: {
  id: string;
  einstellungen: KatalogEinstellungen;
  productIds: string[];
  artikel: KatalogArtikel[];
}) {
  const [e, setE] = useState(einstellungen);
  const [ids, setIds] = useState(productIds);

  const nachId = useMemo(
    () => new Map(artikel.map((a) => [a.id, a])),
    [artikel],
  );
  // Ein inzwischen gelöschter Artikel steht noch in `ids`, aber nicht mehr im
  // Stamm – er fällt hier still heraus, wie auf dem Bogen.
  const gewaehlt = useMemo(
    () => ids.flatMap((artikelId) => nachId.get(artikelId) ?? []),
    [ids, nachId],
  );
  const aufbau = useMemo(() => katalogAufbau(gewaehlt, e), [gewaehlt, e]);
  const enthalten = useMemo(() => new Set(ids), [ids]);

  /**
   * Änderung an der Auswahl: sofort anzeigen, dann speichern. Zurückgerollt
   * wird auf den Stand **vor dieser** Änderung – und nur, wenn seither nichts
   * anderes dazwischenkam, sonst nähme der Fehler einer alten Änderung eine
   * neuere mit.
   */
  function aendereAuswahl(
    neu: string[],
    speichern: () => Promise<AdminFormState>,
  ) {
    const vorher = ids;
    setIds(neu);
    void speichern().then((ergebnis) => {
      if (!ergebnis.error) return;
      toast.error(ergebnis.error);
      setIds((aktuell) => (aktuell === neu ? vorher : aktuell));
    });
  }

  function hinzufuegen(neue: string[]) {
    const fehlend = neue.filter((artikelId) => !enthalten.has(artikelId));
    if (fehlend.length === 0) return;
    aendereAuswahl([...ids, ...fehlend], () => addKatalogArtikel(id, fehlend));
  }

  function entfernen(weg: string[]) {
    const raus = new Set(weg);
    aendereAuswahl(
      ids.filter((artikelId) => !raus.has(artikelId)),
      () => removeKatalogArtikel(id, weg),
    );
  }

  /**
   * Einen Artikel innerhalb seiner Warengruppe um einen Platz verschieben.
   * Getauscht wird mit dem nächsten Artikel **derselben** Gruppe – dazwischen
   * können in `ids` Artikel anderer Gruppen stehen, die im Katalog woanders
   * erscheinen.
   */
  function verschieben(artikelId: string, richtung: -1 | 1) {
    const eigener = nachId.get(artikelId);
    const von = ids.indexOf(artikelId);
    if (!eigener || von < 0) return;

    let nach = von + richtung;
    while (nach >= 0 && nach < ids.length) {
      if (nachId.get(ids[nach])?.kategorieId === eigener.kategorieId) break;
      nach += richtung;
    }
    if (nach < 0 || nach >= ids.length) return;

    const neu = [...ids];
    [neu[von], neu[nach]] = [neu[nach], neu[von]];
    aendereAuswahl(neu, () => setKatalogReihenfolge(id, neu));
  }

  function aendereFeld<F extends KatalogFeld & keyof KatalogEinstellungen>(
    feld: F,
    wert: KatalogEinstellungen[F],
  ) {
    const vorher = e[feld];
    if (vorher === wert) return;
    setE((aktuell) => ({ ...aktuell, [feld]: wert }));
    void updateKatalogFeld(id, feld, wert ?? "").then((ergebnis) => {
      if (!ergebnis.error) return;
      toast.error(ergebnis.error);
      setE((aktuell) =>
        aktuell[feld] === wert ? { ...aktuell, [feld]: vorher } : aktuell,
      );
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_16rem]">
      <KatalogArtikelSuche
        artikel={artikel}
        enthalten={enthalten}
        onHinzufuegen={hinzufuegen}
        onEntfernen={entfernen}
      />
      <KatalogZusammenstellung
        artikel={artikel}
        gewaehlt={gewaehlt}
        preisart={e.preisart}
        ohneFoto={aufbau.ohneFoto}
        ohnePreis={aufbau.ohnePreis}
        onHinzufuegen={hinzufuegen}
        onEntfernen={entfernen}
        onVerschieben={verschieben}
      />
      <KatalogEinstellungenFeld
        id={id}
        e={e}
        aufbau={aufbau}
        ausgewaehlt={gewaehlt.length}
        onAendern={aendereFeld}
      />
    </div>
  );
}

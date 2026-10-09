"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  MailCheck,
  Plus,
  Send,
  Smartphone,
  Monitor,
  UserRound,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  saveNewsletter,
  sendeEinzeln,
  sendeNewsletter,
  sendeTestmail,
  wiederholeFehlgeschlagene,
} from "@/lib/actions/newsletter";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, PRODUCT_BUCKET } from "@/lib/constants";
import {
  AUTO_NAMEN,
  BLOCK_NAMEN,
  neuerBlock,
  type Block,
  type BlockTyp,
  type NewsletterDokument,
} from "@/lib/newsletter";
import type { KundeAuswahl, ProduktAuswahl } from "@/lib/queries/newsletter";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Speicherstand = "gespeichert" | "speichert" | "fehler";

const ENDUNG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const PALETTE: BlockTyp[] = [
  "ueberschrift",
  "text",
  "bild",
  "artikel",
  "auto",
  "button",
  "hinweis",
  "trenner",
];

/**
 * Newsletter-Werkbank: links die Bausteine, rechts die Mail, wie sie ankommt.
 *
 * Wie in der Katalog-Werkbank gibt es keinen Speichern-Knopf: jede Änderung
 * wird nach kurzer Ruhe gespeichert, danach holt sich die Vorschau das
 * Ergebnis vom Server. Die Vorschau ist also nicht ein zweites Layout im
 * Browser, sondern dasselbe HTML, das später an die Kunden geht
 * (lib/newsletter-mail.ts) – was hier steht, kommt an.
 */
export function NewsletterEditor({
  id,
  status,
  start,
  produkte,
  kunden,
  abonnenten,
  versand,
}: {
  id: string;
  status: "draft" | "sending" | "sent";
  start: NewsletterDokument;
  produkte: ProduktAuswahl[];
  kunden: KundeAuswahl[];
  abonnenten: number;
  versand: { gesendet: number; fehlgeschlagen: number; offen: number };
}) {
  const router = useRouter();
  const gesperrt = status !== "draft";
  const [dok, setDok] = useState<NewsletterDokument>(start);
  const [stand, setStand] = useState<Speicherstand>("gespeichert");
  const [html, setHtml] = useState("");
  const [breite, setBreite] = useState<"desktop" | "handy">("desktop");
  const [senden, setSenden] = useState(false);
  const [einzeln, setEinzeln] = useState(false);
  const [laeuft, starte] = useTransition();
  const zaehler = useRef(0);
  const erstes = useRef(true);

  const ladeVorschau = useCallback(async () => {
    const nummer = ++zaehler.current;
    try {
      const antwort = await fetch(`/admin/newsletter/${id}/vorschau`, { cache: "no-store" });
      const text = await antwort.text();
      if (nummer === zaehler.current) setHtml(text);
    } catch {
      /* Vorschau bleibt auf dem letzten Stand */
    }
  }, [id]);

  // Erste Vorschau nach dem Aufbau der Seite (eigener Takt, kein setState im Effekt).
  useEffect(() => {
    const timer = window.setTimeout(() => void ladeVorschau(), 0);
    return () => window.clearTimeout(timer);
  }, [ladeVorschau]);

  // Autospeichern: 700 ms nach der letzten Änderung, danach Vorschau neu.
  useEffect(() => {
    if (gesperrt) return;
    if (erstes.current) {
      erstes.current = false;
      return;
    }
    setStand("speichert");
    const timer = window.setTimeout(async () => {
      const ergebnis = await saveNewsletter(id, dok);
      if (ergebnis.error) {
        setStand("fehler");
        toast.error(ergebnis.error);
        return;
      }
      setStand("gespeichert");
      void ladeVorschau();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dok, gesperrt, id, ladeVorschau]);

  const aendere = (blockId: string, teil: Partial<Block>) =>
    setDok((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === blockId ? ({ ...b, ...teil } as Block) : b)),
    }));

  const verschiebe = (index: number, richtung: -1 | 1) =>
    setDok((d) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[index], blocks[ziel]] = [blocks[ziel], blocks[index]];
      return { ...d, blocks };
    });

  const entferne = (blockId: string) =>
    setDok((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== blockId) }));

  const fuegeEin = (typ: BlockTyp) =>
    setDok((d) => ({ ...d, blocks: [...d.blocks, neuerBlock(typ)] }));

  function test() {
    starte(async () => {
      const e = await sendeTestmail(id);
      if (e.error) toast.error(e.error);
      else toast.success(e.success ?? "Testmail verschickt.");
    });
  }

  function versenden(art: "senden" | "wiederholen") {
    starte(async () => {
      const e = art === "senden" ? await sendeNewsletter(id) : await wiederholeFehlgeschlagene(id);
      setSenden(false);
      if (e.error) toast.error(e.error, { duration: 12000 });
      else toast.success(e.success ?? "Verschickt.", { duration: 12000 });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      {/* ------------------------------------------------------ Bausteine */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs",
              stand === "fehler" ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {stand === "speichert" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {gesperrt
              ? status === "sent"
                ? "Verschickt – nicht mehr änderbar"
                : "Versand läuft – nicht mehr änderbar"
              : stand === "speichert"
                ? "Speichert …"
                : stand === "fehler"
                  ? "Nicht gespeichert"
                  : "Alles gespeichert"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={test} disabled={laeuft}>
              <MailCheck className="size-4" aria-hidden /> Testmail an mich
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEinzeln(true)} disabled={laeuft || (status === "draft" && stand !== "gespeichert")}>
              <UserRound className="size-4" aria-hidden /> An Einzelne senden
            </Button>
            {status === "draft" ? (
              <Button type="button" size="sm" onClick={() => setSenden(true)} disabled={laeuft || stand !== "gespeichert"}>
                <Send className="size-4" aria-hidden /> An {abonnenten} Abonnenten senden
              </Button>
            ) : null}
          </div>
        </div>

        {status !== "draft" ? (
          <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium tabular">
              {versand.gesendet} verschickt
              {versand.fehlgeschlagen > 0 ? ` · ${versand.fehlgeschlagen} fehlgeschlagen` : ""}
              {versand.offen > 0 ? ` · ${versand.offen} offen` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {versand.offen > 0 || status === "sending" ? (
                <Button type="button" size="sm" onClick={() => versenden("senden")} disabled={laeuft}>
                  Versand fortsetzen
                </Button>
              ) : null}
              {versand.fehlgeschlagen > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => versenden("wiederholen")} disabled={laeuft}>
                  Fehlgeschlagene wiederholen
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <fieldset disabled={gesperrt} className="space-y-4 disabled:opacity-70">
          <section className="space-y-3 rounded-lg border border-border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="nl-betreff">Betreff</Label>
              <Input
                id="nl-betreff"
                value={dok.betreff}
                maxLength={150}
                onChange={(e) => setDok({ ...dok, betreff: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-vorschau">Vorschautext</Label>
              <Input
                id="nl-vorschau"
                value={dok.vorschautext}
                maxLength={200}
                placeholder="Steht im Postfach hinter dem Betreff"
                onChange={(e) => setDok({ ...dok, vorschautext: e.target.value })}
              />
            </div>
          </section>

          <ol className="space-y-3">
            {dok.blocks.map((block, index) => (
              <li key={block.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-3 py-1.5">
                  <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {BLOCK_NAMEN[block.typ]}
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => verschiebe(index, -1)} aria-label="Nach oben">
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={index === dok.blocks.length - 1} onClick={() => verschiebe(index, 1)} aria-label="Nach unten">
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => entferne(block.id)} aria-label="Baustein entfernen">
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="space-y-3 p-3">
                  <BlockFelder block={block} produkte={produkte} onChange={(teil) => aendere(block.id, teil)} />
                </div>
              </li>
            ))}
          </ol>

          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Plus className="size-3.5" aria-hidden /> Baustein hinzufügen
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((typ) => (
                <Button key={typ} type="button" variant="outline" size="sm" onClick={() => fuegeEin(typ)}>
                  {BLOCK_NAMEN[typ]}
                </Button>
              ))}
            </div>
          </section>
        </fieldset>
      </div>

      {/* -------------------------------------------------------- Vorschau */}
      <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center gap-1">
          <span className="mr-auto text-sm font-medium">Vorschau</span>
          <Button type="button" variant={breite === "desktop" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setBreite("desktop")} aria-label="Desktop-Ansicht">
            <Monitor aria-hidden />
          </Button>
          <Button type="button" variant={breite === "handy" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setBreite("handy")} aria-label="Handy-Ansicht">
            <Smartphone aria-hidden />
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-[#eceef2]">
          <iframe
            title="Vorschau des Newsletters"
            srcDoc={html}
            sandbox=""
            className={cn(
              "mx-auto block h-[78vh] bg-white transition-[width]",
              breite === "desktop" ? "w-full" : "w-[390px] max-w-full",
            )}
          />
        </div>
      </div>

      <EinzelDialog
        offen={einzeln}
        onOffen={setEinzeln}
        newsletterId={id}
        betreff={dok.betreff}
        kunden={kunden}
      />

      <Dialog open={senden} onOpenChange={setSenden}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Newsletter an {abonnenten} Abonnenten senden?</DialogTitle>
            <DialogDescription>
              „{dok.betreff}“ geht jetzt an alle Kunden, die den Newsletter
              abonniert haben. Das lässt sich nicht zurücknehmen – schau dir vorher
              die Testmail an. Danach ist der Newsletter nicht mehr änderbar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSenden(false)} disabled={laeuft}>
              Abbrechen
            </Button>
            <Button type="button" onClick={() => versenden("senden")} disabled={laeuft || abonnenten === 0}>
              {laeuft ? "Wird verschickt …" : "Jetzt senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Felder je Baustein --------------------------------------------------------

function BlockFelder({
  block,
  produkte,
  onChange,
}: {
  block: Block;
  produkte: ProduktAuswahl[];
  onChange: (teil: Partial<Block>) => void;
}) {
  switch (block.typ) {
    case "ueberschrift":
      return (
        <Input
          value={block.text}
          maxLength={160}
          aria-label="Überschrift"
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "text":
      return (
        <div className="space-y-1.5">
          <Textarea
            value={block.text}
            rows={6}
            maxLength={4000}
            aria-label="Text"
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground">
            Leerzeile = neuer Absatz · **fett** · [Linktext](https://…) oder [Shop](/shop)
          </p>
        </div>
      );
    case "bild":
      return <BildFelder block={block} onChange={onChange} />;
    case "artikel":
      return <ArtikelFelder block={block} produkte={produkte} onChange={onChange} />;
    case "auto":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AUTO_NAMEN) as (keyof typeof AUTO_NAMEN)[]).map((q) => (
              <Button key={q} type="button" size="sm" variant={block.quelle === q ? "default" : "outline"} onClick={() => onChange({ quelle: q })}>
                {AUTO_NAMEN[q]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Anzahl</span>
            {[2, 4, 6, 8].map((n) => (
              <Button key={n} type="button" size="sm" variant={block.anzahl === n ? "default" : "outline"} onClick={() => onChange({ anzahl: n })}>
                {n}
              </Button>
            ))}
          </div>
          <PreisSchalter an={block.preise} onChange={(preise) => onChange({ preise })} id={block.id} />
          <p className="text-[11px] text-muted-foreground">
            Wird beim Senden aus dem Sortiment gezogen: nur lieferbare Artikel mit Foto.
          </p>
        </div>
      );
    case "button":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={block.text} maxLength={60} placeholder="Beschriftung" aria-label="Beschriftung" onChange={(e) => onChange({ text: e.target.value })} />
          <Input value={block.url} maxLength={500} placeholder="/shop oder https://…" aria-label="Adresse" onChange={(e) => onChange({ url: e.target.value })} />
        </div>
      );
    case "hinweis":
      return (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant={block.ton === "aktion" ? "default" : "outline"} onClick={() => onChange({ ton: "aktion" })}>
              Aktion (gold)
            </Button>
            <Button type="button" size="sm" variant={block.ton === "info" ? "default" : "outline"} onClick={() => onChange({ ton: "info" })}>
              Info (blau)
            </Button>
          </div>
          <Textarea value={block.text} rows={3} maxLength={600} aria-label="Hinweis" onChange={(e) => onChange({ text: e.target.value })} />
        </div>
      );
    case "trenner":
      return <p className="text-xs text-muted-foreground">Eine feine Linie zwischen zwei Abschnitten.</p>;
  }
}

function PreisSchalter({ an, onChange, id }: { an: boolean; onChange: (an: boolean) => void; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={`preise-${id}`} checked={an} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={`preise-${id}`} className="font-normal">
        Netto-Preis anzeigen
      </Label>
    </div>
  );
}

function BildFelder({
  block,
  onChange,
}: {
  block: Extract<Block, { typ: "bild" }>;
  onChange: (teil: Partial<Block>) => void;
}) {
  const [laedt, setLaedt] = useState(false);
  const eingabe = useRef<HTMLInputElement>(null);

  async function hochladen(datei: File | undefined) {
    if (!datei) return;
    if (!ALLOWED_IMAGE_TYPES.includes(datei.type)) {
      toast.error("Nur JPEG, PNG, WebP oder AVIF.");
      return;
    }
    if (datei.size > MAX_IMAGE_BYTES) {
      toast.error("Das Bild ist größer als 5 MB.");
      return;
    }
    setLaedt(true);
    const pfad = `newsletter/${crypto.randomUUID()}.${ENDUNG[datei.type]}`;
    const { error } = await createClient()
      .storage.from(PRODUCT_BUCKET)
      .upload(pfad, datei.slice(0, datei.size, datei.type), { contentType: datei.type });
    setLaedt(false);
    if (eingabe.current) eingabe.current.value = "";
    if (error) {
      console.error("[newsletter] Upload:", error.message);
      toast.error("Das Bild konnte nicht hochgeladen werden.");
      return;
    }
    onChange({ pfad });
  }

  return (
    <div className="space-y-2">
      {block.pfad ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/newsletter/bild?p=${encodeURIComponent(block.pfad)}`}
          alt=""
          className="max-h-40 w-full rounded border border-border object-contain"
        />
      ) : null}
      <input
        ref={eingabe}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => void hochladen(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" size="sm" disabled={laedt} onClick={() => eingabe.current?.click()}>
        {laedt ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
        {block.pfad ? "Bild ersetzen" : "Bild hochladen"}
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={block.alt} maxLength={160} placeholder="Bildbeschreibung (alt)" aria-label="Bildbeschreibung" onChange={(e) => onChange({ alt: e.target.value })} />
        <Input value={block.link} maxLength={500} placeholder="Link beim Klick (optional)" aria-label="Link" onChange={(e) => onChange({ link: e.target.value })} />
      </div>
      <p className="text-[11px] text-muted-foreground">Am besten 1072 px breit (doppelte Auflösung), höchstens 5 MB.</p>
    </div>
  );
}

function ArtikelFelder({
  block,
  produkte,
  onChange,
}: {
  block: Extract<Block, { typ: "artikel" }>;
  produkte: ProduktAuswahl[];
  onChange: (teil: Partial<Block>) => void;
}) {
  const [suche, setSuche] = useState("");
  const nachId = useMemo(() => new Map(produkte.map((p) => [p.id, p])), [produkte]);

  const treffer = useMemo(() => {
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (woerter.length === 0) return [];
    return produkte
      .filter((p) => !block.ids.includes(p.id))
      .filter((p) => {
        const heu = `${p.name} ${p.sku}`.toLowerCase();
        return woerter.every((w) => heu.includes(w));
      })
      .slice(0, 8);
  }, [suche, produkte, block.ids]);

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {block.ids.map((pid) => {
          const p = nachId.get(pid);
          return (
            <li key={pid} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/newsletter/bild?produkt=${pid}`} alt="" className="size-9 shrink-0 rounded border border-border bg-white object-contain" />
              <span className="min-w-0 flex-1 truncate">{p?.name ?? "Artikel nicht mehr verfügbar"}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange({ ids: block.ids.filter((i) => i !== pid) })} aria-label="Artikel entfernen">
                <X aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>

      {block.ids.length < 12 ? (
        <div className="relative">
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Artikel suchen (Name oder Nummer) …"
            aria-label="Artikel suchen"
          />
          {treffer.length > 0 ? (
            <ul className="mt-1 divide-y divide-border rounded-md border border-border bg-card text-sm shadow-sm">
              {treffer.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      onChange({ ids: [...block.ids, p.id] });
                      setSuche("");
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/newsletter/bild?produkt=${p.id}`} alt="" className="size-8 shrink-0 rounded border border-border bg-white object-contain" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="code shrink-0 text-xs text-muted-foreground">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Höchstens 12 Artikel je Baustein.</p>
      )}
      <PreisSchalter an={block.preise} onChange={(preise) => onChange({ preise })} id={block.id} />
    </div>
  );
}


// --- Einzelversand ---------------------------------------------------------------

/**
 * An ausgewählte Kunden und/oder einzelne Adressen – unabhängig vom Abo, ohne
 * den Newsletter zu sperren. Wer ihn schon hat, bekommt ihn nicht noch einmal.
 */
function EinzelDialog({
  offen,
  onOffen,
  newsletterId,
  betreff,
  kunden,
}: {
  offen: boolean;
  onOffen: (offen: boolean) => void;
  newsletterId: string;
  betreff: string;
  kunden: KundeAuswahl[];
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<KundeAuswahl[]>([]);
  const [adressen, setAdressen] = useState("");
  const [laeuft, start] = useTransition();

  const treffer = useMemo(() => {
    const woerter = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (woerter.length === 0) return [];
    return kunden
      .filter((k) => !gewaehlt.some((g) => g.id === k.id))
      .filter((k) => {
        const heu = `${k.name} ${k.email}`.toLowerCase();
        return woerter.every((w) => heu.includes(w));
      })
      .slice(0, 8);
  }, [suche, kunden, gewaehlt]);

  const anzahlAdressen = adressen.split(/[\s,;]+/).filter(Boolean).length;
  const gesamt = gewaehlt.length + anzahlAdressen;
  const ohneAbo = gewaehlt.filter((k) => !k.abonniert).length;

  function senden() {
    start(async () => {
      const e = await sendeEinzeln(
        newsletterId,
        gewaehlt.map((k) => k.id),
        adressen,
      );
      if (e.error) {
        toast.error(e.error, { duration: 10000 });
        return;
      }
      toast.success(e.success ?? "Verschickt.", { duration: 10000 });
      setGewaehlt([]);
      setAdressen("");
      setSuche("");
      onOffen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={offen} onOpenChange={onOffen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>An Einzelne senden</DialogTitle>
          <DialogDescription>
            „{betreff}“ geht nur an die, die du hier auswählst – egal, ob sie den
            Newsletter abonniert haben. Wer ihn schon bekommen hat, wird übersprungen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ez-suche">Kunden</Label>
            {gewaehlt.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {gewaehlt.map((k) => (
                  <li key={k.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs">
                    {k.name}
                    <button type="button" aria-label={`${k.name} entfernen`} onClick={() => setGewaehlt((g) => g.filter((x) => x.id !== k.id))}>
                      <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Input id="ez-suche" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Kunde suchen (Firma, Name oder E-Mail) …" autoComplete="off" />
            {treffer.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {treffer.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => {
                        setGewaehlt((g) => [...g, k]);
                        setSuche("");
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{k.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{k.email}</span>
                      {k.abonniert ? <span className="shrink-0 rounded bg-success/10 px-1.5 text-[10px] text-success">Abo</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ez-adressen">Einzelne E-Mail-Adressen</Label>
            <Textarea
              id="ez-adressen"
              value={adressen}
              onChange={(e) => setAdressen(e.target.value)}
              rows={3}
              placeholder="max@firma.de, anna@firma.de"
            />
            <p className="text-[11px] text-muted-foreground">
              Getrennt durch Komma, Semikolon oder Zeilenumbruch. An Adressen ohne
              Kundenkonto geht die Mail ohne Abmeldelink als persönliche Nachricht.
            </p>
          </div>

          {ohneAbo > 0 ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {ohneAbo} {ohneAbo === 1 ? "ausgewählter Kunde hat" : "ausgewählte Kunden haben"} den
              Newsletter nicht abonniert. Werbung an Nicht-Abonnenten ist nur mit
              Einwilligung oder bei persönlichem Anlass zulässig.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOffen(false)} disabled={laeuft}>
            Abbrechen
          </Button>
          <Button type="button" onClick={senden} disabled={laeuft || gesamt === 0}>
            {laeuft ? "Wird verschickt …" : `An ${gesamt} Empfänger senden`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

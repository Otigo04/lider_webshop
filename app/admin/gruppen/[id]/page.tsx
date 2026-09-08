import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ImageOff, Pencil, Plus } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { AusfuehrungLoesen, GruppeKopf } from "@/components/admin/gruppe-kopf";
import { GruppenGenerator } from "@/components/admin/gruppen-generator";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { deleteProductGroup } from "@/lib/actions/groups";
import { formatPrice, formatQuantity } from "@/lib/format";
import { getProductAttributes } from "@/lib/queries/attributes";
import { getProductGroup } from "@/lib/queries/groups";
import { getCategories, getLastUsedCategoryId } from "@/lib/queries/products";

export async function generateMetadata({
  params,
}: PageProps<"/admin/gruppen/[id]">): Promise<Metadata> {
  const { id } = await params;
  const gruppe = await getProductGroup(id);
  return { title: gruppe ? gruppe.name : "Angebot" };
}

export default async function GruppePage({
  params,
}: PageProps<"/admin/gruppen/[id]">) {
  const { id } = await params;

  const [gruppe, attributes, categories, zuletztKategorieId] = await Promise.all([
    getProductGroup(id),
    getProductAttributes(),
    getCategories(),
    getLastUsedCategoryId(),
  ]);
  if (!gruppe) notFound();

  // Wertbeschriftungen einmal nachschlagen: die Mitglieder tragen nur IDs.
  const werte = new Map(
    attributes.flatMap((attribut) =>
      attribut.values.map((wert) => [wert.id, { wert, attribut }] as const),
    ),
  );

  return (
    <div>
      <Link
        href="/admin/gruppen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Alle Ausführungen
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruppe.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular">
            {formatQuantity(gruppe.members.length)}{" "}
            {gruppe.members.length === 1 ? "Ausführung" : "Ausführungen"}
          </p>
        </div>

        <ConfirmAction
          action={deleteProductGroup}
          fields={{ id: gruppe.id }}
          title={`„${gruppe.name}“ auflösen?`}
          description="Die Klammer verschwindet, die Artikel bleiben. Sie stehen danach wieder einzeln im Sortiment – mit Bestand, Preisen und Bestellhistorie."
          confirmLabel="Auflösen"
          trigger={<Button variant="outline">Angebot auflösen</Button>}
        />
      </div>

      <div className="mt-8 max-w-2xl">
        <GruppeKopf gruppe={gruppe} />
      </div>

      {/* ----------------------------------------------------- Ausführungen */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight">Ausführungen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jede ist ein eigener Artikel: eigene Nummer, eigener Barcode, eigener
          Bestand. Preise und Bestände lassen sich wie gewohnt in der
          Artikelliste ändern.
        </p>

        {gruppe.members.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Diesem Angebot ist noch kein Artikel zugeordnet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Foto</th>
                  <th className="py-2 pr-3 font-medium">Artikel</th>
                  <th className="py-2 pr-3 font-medium">Merkmale</th>
                  <th className="py-2 pr-3 text-right font-medium">GH</th>
                  <th className="py-2 pr-3 text-right font-medium">EH</th>
                  <th className="py-2 pr-3 text-right font-medium">Bestand</th>
                  <th className="w-20 py-2 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {gruppe.members.map((member) => {
                  const merkmale = member.valueIds
                    .map((valueId) => werte.get(valueId))
                    .filter((eintrag) => eintrag !== undefined);

                  return (
                    <tr
                      key={member.id}
                      className="border-b border-border align-top last:border-0 hover:bg-muted/50"
                    >
                      <td className="py-2 pr-3">
                        <div className="relative size-12 overflow-hidden rounded border border-border bg-muted">
                          {member.imageUrl ? (
                            <Image
                              src={member.imageUrl}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-contain p-0.5"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-muted-foreground">
                              <ImageOff className="size-4" aria-hidden />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/products/${member.id}/edit`}
                          className="font-medium hover:underline"
                        >
                          {member.name}
                        </Link>
                        <p className="code text-xs text-muted-foreground">
                          {member.sku}
                          {member.barcode ? ` · ${member.barcode}` : ""}
                        </p>
                        {/* Ohne Foto steht die Ausführung nicht im Sortiment
                            (Migration 020) und fehlt damit still in der
                            Auswahl. Bei einem Bündel fällt das sonst nicht auf –
                            die Kachel ist ja da. */}
                        {!member.has_image ? (
                          <p className="mt-0.5 text-xs text-warning">
                            Kein Foto – im Shop nicht wählbar
                          </p>
                        ) : null}
                        {!member.is_active ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            ausgeblendet
                          </p>
                        ) : null}
                      </td>

                      <td className="py-2 pr-3">
                        {merkmale.length === 0 ? (
                          <span className="text-xs text-warning">
                            Keine Merkmale – steht in keinem Auswahlfeld
                          </span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {merkmale.map(({ wert, attribut }) => (
                              <span
                                key={wert.id}
                                className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs"
                              >
                                {attribut.kind === "color" ? (
                                  <span
                                    aria-hidden
                                    className="size-3 shrink-0 rounded-full border border-black/20"
                                    style={{
                                      backgroundColor: wert.hex ?? "transparent",
                                    }}
                                  />
                                ) : null}
                                {wert.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>

                      <td className="py-2 pr-3 text-right tabular">
                        {member.unitPrice !== null
                          ? formatPrice(member.unitPrice)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {member.retail_price !== null
                          ? formatPrice(member.retail_price)
                          : "—"}
                      </td>

                      <td className="py-2 pr-3 text-right">
                        <span className="tabular">
                          {formatQuantity(member.stock_available)}
                        </span>
                        <div className="mt-0.5 flex justify-end">
                          <StockBadge free={member.free} />
                        </div>
                      </td>

                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Artikel bearbeiten"
                          >
                            <Link href={`/admin/products/${member.id}/edit`}>
                              <Pencil className="size-4" aria-hidden />
                              <span className="sr-only">
                                {member.name} bearbeiten
                              </span>
                            </Link>
                          </Button>
                          <AusfuehrungLoesen
                            productId={member.id}
                            name={member.name}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- Nachlegen */}
      <section className="mt-12">
        <details className="group rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
            <Plus className="size-4 text-brand" aria-hidden />
            Weitere Ausführungen anlegen
            <span className="text-xs font-normal text-muted-foreground">
              neue Farbe, neue Größe
            </span>
          </summary>

          <div className="border-t border-border p-5">
            {/* Zugeklappt, weil es die Ausnahme ist: ein Angebot wird einmal
                zusammengestellt und danach höchstens erweitert. Aufgeklappt
                stünde der ganze Generator über der Liste, die man eigentlich
                sehen will. */}
            <GruppenGenerator
              categories={categories}
              attributes={attributes}
              zuletztKategorieId={zuletztKategorieId}
              gruppe={{ id: gruppe.id, name: gruppe.name }}
            />
          </div>
        </details>
      </section>
    </div>
  );
}

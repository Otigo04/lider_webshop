import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { CategoryForm } from "@/components/forms/category-form";
import { Button } from "@/components/ui/button";
import { deleteCategory } from "@/lib/actions/admin-categories";
import { getCategories } from "@/lib/queries/products";

export const metadata: Metadata = { title: "Kategorien" };

export default async function AdminCategoriesPage({
  searchParams,
}: PageProps<"/admin/categories">) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;

  const categories = await getCategories();
  const editing = categories.find((category) => category.id === editId);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Kategorien</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Die Reihenfolge bestimmt, wie die Warengruppen im Shop erscheinen.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-x-auto">
          {categories.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              Noch keine Kategorien angelegt.
            </p>
          ) : (
            <table className="w-full min-w-2xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Reihenfolge</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Nummernkreis</th>
                  <th className="py-2 pr-4 font-medium">Kürzel</th>
                  <th className="py-2 text-right font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr
                    key={category.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {category.order_index}
                    </td>
                    <td className="py-3 pr-4 font-medium">{category.name}</td>
                    <td className="py-3 pr-4 tabular">
                      {category.sku_prefix ? (
                        <span className="text-muted-foreground">
                          {category.sku_prefix}-0001 …
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="py-3 pr-4 tabular text-muted-foreground">
                      {category.slug}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/admin/categories?edit=${category.id}`}>
                            Bearbeiten
                          </Link>
                        </Button>
                        <ConfirmAction
                          action={deleteCategory}
                          fields={{ id: category.id }}
                          title={`„${category.name}“ löschen?`}
                          description="Die Kategorie wird entfernt. Artikel, die noch daran hängen, verhindern das Löschen."
                          confirmLabel="Löschen"
                          destructive
                          trigger={
                            <Button variant="ghost" size="sm">
                              Löschen
                            </Button>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="h-fit rounded-md border border-border p-5">
          <h2 className="font-medium">
            {editing ? "Kategorie bearbeiten" : "Neue Kategorie"}
          </h2>
          <div className="mt-4">
            <CategoryForm key={editing?.id ?? "neu"} category={editing} />
          </div>
        </aside>
      </div>
    </div>
  );
}

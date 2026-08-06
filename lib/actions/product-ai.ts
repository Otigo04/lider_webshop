"use server";

import { generateText, Output } from "ai";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getCategories } from "@/lib/queries/products";

export interface ProductAnalysis {
  name: string;
  description: string;
  category_id: string | null;
}

export interface AnalyzeState {
  data?: ProductAnalysis;
  error?: string;
}

const analysisSchema = z.object({
  name: z.string().describe("Kurzer, sachlicher Produktname auf Deutsch"),
  description: z
    .string()
    .describe(
      "2-3 sachliche Sätze auf Deutsch, keine Marketing-Floskeln, keine erfundenen technischen Details",
    ),
  category_id: z
    .string()
    .describe("Die ID der am besten passenden Kategorie aus der Liste"),
});

/**
 * Vision-Analyse eines frisch hochgeladenen Artikelfotos. Preis und Bestand
 * bleiben bewusst außen vor – die kennt nur der Admin, eine Schätzung wäre
 * hier reine Spekulation.
 *
 * Wirft nie, damit ein Fehler (fehlender API-Key, Rate-Limit, Netzwerk) das
 * Formular nie blockiert – der Admin füllt in dem Fall einfach manuell aus.
 */
export async function analyzeProductPhoto(
  imageUrl: string,
): Promise<AnalyzeState> {
  await requireAdmin();

  const categories = await getCategories();
  if (categories.length === 0) {
    return { error: "Keine Kategorien vorhanden." };
  }

  const categoryList = categories
    .map((category) => `${category.id}: ${category.name}`)
    .join("\n");

  try {
    const { output } = await generateText({
      model: "anthropic/claude-haiku-4.5",
      output: Output.object({ schema: analysisSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analysiere dieses Produktfoto für den Katalog eines B2B-Großhandels (Spielzeug, Multimedia, Handyzubehör). Wähle die am besten passende Kategorie-ID aus dieser Liste:\n${categoryList}`,
            },
            { type: "image", image: imageUrl },
          ],
        },
      ],
    });

    const categoryValid = categories.some(
      (category) => category.id === output.category_id,
    );

    return {
      data: {
        name: output.name,
        description: output.description,
        category_id: categoryValid ? output.category_id : null,
      },
    };
  } catch (error) {
    console.error("[admin] KI-Fotoanalyse:", error);
    return { error: "KI-Analyse fehlgeschlagen." };
  }
}

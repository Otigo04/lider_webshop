"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { AdminFormState } from "@/lib/actions/admin-categories";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "done"]),
});

export async function updateAccessRequestStatus(
  _prevState: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  await requireAdmin();

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Ungültiger Status." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("access_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[admin] Zugangsanfrage-Status:", error.message);
    return { error: "Der Status konnte nicht geändert werden." };
  }

  revalidatePath("/admin/zugangsanfragen");
  revalidatePath(`/admin/zugangsanfragen/${parsed.data.id}`);
  return {
    success: `Status auf „${ACCESS_REQUEST_STATUS_LABELS[parsed.data.status]}“ gesetzt.`,
  };
}

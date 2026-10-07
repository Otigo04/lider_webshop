"use server";

import { redirect } from "next/navigation";
import { redeemVerification } from "@/lib/verification";

/** Knopf auf /bestaetigen. Ein POST, damit Mail-Scanner den Link nicht verbrauchen. */
export async function confirmEmail(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const ok = token.length > 0 && token.length < 200 && (await redeemVerification(token));
  redirect(ok ? "/login?notice=bestaetigt" : "/login?error=link_ungueltig");
}

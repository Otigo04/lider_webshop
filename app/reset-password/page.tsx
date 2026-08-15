import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Neues Passwort",
};

/**
 * Erreichbar nur über den Link aus der Reset-Mail (app/auth/confirm/route.ts
 * hat davor per verifyOtp() die Recovery-Session gesetzt). Ohne gültige
 * Session zurück zum Anfordern schicken statt eine leere Seite zu zeigen.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=ungueltig");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Neues Passwort</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Vergeben Sie ein neues Passwort für Ihr Konto.
      </p>

      <div className="mt-8 rounded-md border border-border bg-card p-6">
        <ResetPasswordForm />
      </div>
    </div>
  );
}

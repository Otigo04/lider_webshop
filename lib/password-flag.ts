import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Nimmt den Passwortwechsel-Zwang zurück. Bewusst keine Server Action: in
 * einer "use server"-Datei wäre die Funktion für jeden Browser aufrufbar, mit
 * Service-Key und frei wählbarer Nutzerkennung. Aufrufen darf das nur Code,
 * der den Kunden eben sein Passwort hat setzen lassen.
 * app_metadata ist für den Kunden nicht schreibbar; `null` löscht den Schlüssel.
 */
export async function clearMustChangePassword(userId: string) {
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
    app_metadata: { must_change_password: null },
  });
  if (error) {
    console.error("[auth] Passwortzwang zurücknehmen:", error.message);
  }
}

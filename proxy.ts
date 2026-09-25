import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16: `middleware.ts` heißt jetzt `proxy.ts` (Runtime immer nodejs).
 *
 * Drei Aufgaben:
 *  1. Supabase-Session bei jedem Request auffrischen und die rotierten
 *     Auth-Cookies an Request und Response durchreichen.
 *  2. Nicht angemeldete Besucher von geschützten Bereichen auf /login schicken.
 *  3. Im Wartungsmodus (company_settings.maintenance_mode) unregistrierte
 *     Besucher auf /wartung umleiten – Bestandskunden und Admin kommen mit
 *     Sitzung weiterhin überall rein.
 *
 * Die Rollenprüfung (admin vs. customer) passiert NICHT hier, sondern in
 * app/admin/layout.tsx und app/kasse/layout.tsx. Grund: die Rolle steht in
 * public.users, und ein DB-Query pro Request wäre im Proxy zu teuer.
 */

/**
 * /shop ist bewusst NICHT geschützt: das Sortiment ist auch ohne Login als
 * Schaufenster sichtbar (Name, Foto, Beschreibung – ohne Preise und Bestand,
 * siehe supabase/migrations/006_oeffentlicher_katalog.sql). Bestellen bleibt
 * über /cart und /checkout an ein Konto gebunden.
 */
const PROTECTED_PREFIXES = [
  "/cart",
  "/checkout",
  "/orders",
  "/account",
  "/admin",
  "/kasse",
];

/**
 * Bleibt auch im Wartungsmodus für anonyme Besucher erreichbar: nur
 * Impressum und Datenschutz (Pflichtangaben) sowie die Wartungsseite selbst.
 * /login, /register, /forgot-password, /reset-password und /auth sind
 * bewusst NICHT dabei – während der Wartung kommt niemand ohne bestehende
 * Sitzung rein, auch keine Bestandskunden.
 *
 * Achtung Selbstaussperrung: verliert der Admin seine Sitzung, während der
 * Schalter aktiv ist, zeigt auch /login den Wartungsscreen – Zurücksetzen
 * dann nur noch per SQL-Editor (`update company_settings set
 * maintenance_mode = false`), nicht mehr über die Oberfläche.
 */
const MAINTENANCE_EXEMPT_PREFIXES = ["/wartung", "/impressum", "/datenschutz"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Muss getUser() sein, nicht getSession(): nur getUser() validiert das Token
  // gegen den Auth-Server. Der Aufruf triggert zugleich den Cookie-Refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Geschützte Routen sind an dieser Stelle immer mit Sitzung erreicht
  // (sonst griff der Redirect oben schon), also nie im Wartungsmodus.
  const istWartungsAusnahme = MAINTENANCE_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected && !user && !istWartungsAusnahme) {
    // rpc() statt Tabellenzugriff: company_settings selbst ist nur für
    // Angemeldete lesbar, siehe public_maintenance_status() in Migration 041
    // (Spalten erweitert in 043). Fehlt die Funktion (Migration noch nicht
    // eingespielt), bleibt der Shop offen statt für alle Besucher zu sperren
    // – fail open.
    const { data } = await supabase.rpc("public_maintenance_status");
    const zeile = Array.isArray(data) ? data[0] : data;
    if (zeile?.enabled === true) {
      const wartungUrl = request.nextUrl.clone();
      wartungUrl.pathname = "/wartung";
      wartungUrl.search = "";
      return NextResponse.rewrite(wartungUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Alles außer statischen Assets und Bilddateien. Wichtig: `response`
     * unverändert zurückgeben, sonst gehen die refreshten Cookies verloren.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};

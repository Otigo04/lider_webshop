import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next 16: `middleware.ts` heißt jetzt `proxy.ts` (Runtime immer nodejs).
 *
 * Zwei Aufgaben:
 *  1. Supabase-Session bei jedem Request auffrischen und die rotierten
 *     Auth-Cookies an Request und Response durchreichen.
 *  2. Nicht angemeldete Besucher von geschützten Bereichen auf /login schicken.
 *
 * Die Rollenprüfung (admin vs. customer) passiert NICHT hier, sondern in
 * app/admin/layout.tsx. Grund: die Rolle steht in public.users, und ein
 * DB-Query pro Request wäre im Proxy zu teuer.
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
];

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

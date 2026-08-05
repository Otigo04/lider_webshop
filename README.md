# LIDER Berlin – Großhandels-Shop

B2B-Kundenportal: Sortiment mit Staffelpreisen, Warenkorb, Bestellung und
Admin-Panel. Next.js 16 (App Router), TypeScript, Tailwind v4, Supabase.

Fachliche Vorgaben stehen in `CLAUDE.md`, der Bauplan in
`IMPLEMENTIERUNGSPLAN.md`.

---

## Lokal starten

```bash
npm install
cp .env.local.example .env.local   # Werte eintragen
npm run dev                        # http://localhost:3000
```

### Umgebungsvariablen

Supabase Dashboard → Project Settings → API.

| Variable | Bedeutung |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Öffentlicher Key (anon / publishable), Zugriff über RLS begrenzt |
| `SUPABASE_SERVICE_KEY` | Service-Key (service_role / secret). **Umgeht RLS. Nur serverseitig, nie committen.** |

---

## Datenbank aufsetzen

Im Supabase SQL Editor, in dieser Reihenfolge. Alle Skripte sind idempotent.

1. `supabase/schema.sql`
2. `supabase/migrations/001_bestand_auf_produkt.sql`
3. `supabase/migrations/002_bestellung_anlegen.sql`
4. `supabase/migrations/003_erstadmin_ermoeglichen.sql`
5. `supabase/migrations/004_artikelnummern_und_versand.sql`

### Erstes Adminkonto

Authentication → Users → Add user → Create new user, **Auto Confirm User**
anhaken. Danach im SQL Editor:

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'DEINE@MAIL.DE';
```

Weitere Konten legt der Admin im Portal unter Verwaltung → Kunden an. Eine
öffentliche Registrierung gibt es nicht.

---

## Aufbau

```
app/                Routen (App Router)
  admin/            Verwaltung, per requireAdmin() abgesichert
  shop/, cart/, checkout/, orders/, account/
components/         UI, Formulare, ui/ = shadcn
lib/
  actions/          Server Actions
  queries/          Lesezugriffe
  supabase/         client (Browser) / server (Cookies) / admin (Service-Key)
  pricing.ts        Staffelpreise, Bestandsstufen
  shipping.ts       Versandregeln
proxy.ts            Session-Refresh und Login-Zwang
supabase/           Schema und Migrationen
```

### Entscheidungen, die beim Weiterbauen wichtig sind

- **`proxy.ts` statt `middleware.ts`** – in Next 16 umbenannt.
- **`cookies()`, `params`, `searchParams` sind Promises** und müssen awaited
  werden.
- **Typecheck über `npm run build`**, nicht über nacktes `tsc --noEmit`: Typen
  wie `PageProps` entstehen erst beim Build.
- **Keine `tailwind.config.ts`** – Farben stehen als CSS-Variablen im
  `@theme`-Block von `app/globals.css`.
- **Der Katalog ist nicht öffentlich.** RLS gibt Artikel und Preise nur an
  angemeldete, aktive Kunden heraus.
- **Preise kommen beim Bestellen aus der Datenbank**, nicht aus dem Warenkorb.
  `create_order()` rechnet alles neu und reserviert den Bestand in derselben
  Transaktion.
- **Der Storage-Bucket `products` ist privat.** Fotos laufen über Signed URLs
  aus `lib/storage.ts`.
- **Versandkosten stecken nicht in `total_amount`** – das bleibt der reine
  Warenwert. Ab 100 € netto ist der Versand kostenfrei, darunter wird nach
  Gewicht abgerechnet (`lib/shipping.ts`).

---

## Prüfen

```bash
npm run build     # Build inklusive Typecheck
npx eslint .      # Lint
```

---

## Deployment auf Vercel

1. Repository zu GitHub pushen
2. Vercel → Add New → Project → Repository importieren
3. Framework Next.js wird erkannt, Root Directory bleibt leer
4. Environment Variables setzen (alle drei aus der Tabelle oben, für
   Production **und** Preview)
5. Deploy

Nach dem ersten Deployment in Supabase unter Authentication → URL
Configuration die Vercel-Domain als Site URL eintragen.

### Vor dem Livegang

- [ ] Anschrift, Telefon, E-Mail und Registerdaten in `app/impressum/page.tsx`,
      `app/datenschutz/page.tsx`, `app/page.tsx` und `app/login/page.tsx`
      eintragen (mit `[ ]` markiert)
- [ ] Supabase → Serverregion prüfen und in der Datenschutzerklärung eintragen
- [ ] Supabase → Database → Backups aktivieren
- [ ] Eigenen SMTP-Anbieter hinterlegen, falls Kunden per E-Mail eingeladen
      werden sollen; aktuell wird das Startpasswort im Portal angezeigt

/*
 * Service Worker für die Admin-Benachrichtigungen. Er macht nur zwei Dinge:
 * Push anzeigen und beim Antippen die Zielseite öffnen. Kein Caching, kein
 * fetch-Handler – der Shop lädt ganz normal.
 *
 * iOS entzieht ein Push-Abo, wenn ein Push nicht als sichtbare Mitteilung
 * endet. Darum wird IMMER eine angezeigt, auch bei leerem oder defektem Inhalt.
 *
 * Das Symbol steht fest hier (ein Worker kann lib/logo.ts nicht nutzen):
 * public/logo/logo-mark.png, das Wappen.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    daten = {};
  }
  // Gültiges JSON muss kein Objekt sein: `null`, eine Zahl, ein String oder ein
  // Array werfen kein Parse-Fehler, würden aber unten beim Lesen von
  // daten.title abstürzen – und dann bliebe die Mitteilung aus.
  if (!daten || typeof daten !== "object" || Array.isArray(daten)) daten = {};

  // Nur Strings zählen; alles andere (Zahl, Objekt, leer) fällt auf den
  // Standardtext zurück, damit showNotification immer gültige Werte bekommt.
  const text = (wert, fallback) =>
    typeof wert === "string" && wert !== "" ? wert : fallback;

  event.waitUntil(
    self.registration
      .showNotification(text(daten.title, "LIDER"), {
        body: text(daten.body, "Neue Meldung bei LIDER"),
        tag: text(daten.tag, "lider"),
        icon: "/logo/logo-mark.png",
        data: { url: text(daten.url, "/admin") },
      })
      // Der Fehler wird geloggt, das Versprechen bleibt aber an waitUntil
      // gebunden, damit der Worker bis zur Anzeige am Leben bleibt.
      .catch((err) => console.error("[sw] showNotification fehlgeschlagen:", err)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Nur Ziele auf der eigenen Domain; alles andere fällt auf /admin zurück.
  let ziel = new URL("/admin", self.location.origin);
  try {
    const gewuenscht = new URL(event.notification.data?.url || "/admin", self.location.origin);
    if (gewuenscht.origin === self.location.origin) ziel = gewuenscht;
  } catch {
    /* bleibt bei /admin */
  }

  event.waitUntil(
    (async () => {
      const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const f of fenster) {
        if (new URL(f.url).origin === self.location.origin && "focus" in f) {
          // Schlägt das Fokussieren fehl (z. B. Fenster gerade geschlossen),
          // darf das nicht das Öffnen verhindern: dann geht es unten mit
          // openWindow weiter.
          try {
            await f.focus();
            if ("navigate" in f) {
              try {
                await f.navigate(ziel.href);
              } catch {
                /* Fenster bleibt, wo es ist */
              }
            }
            return;
          } catch {
            break;
          }
        }
      }
      await self.clients.openWindow(ziel.href);
    })(),
  );
});

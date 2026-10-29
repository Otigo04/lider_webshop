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

  event.waitUntil(
    self.registration.showNotification(daten.title || "LIDER", {
      body: daten.body || "Neue Meldung bei LIDER",
      tag: daten.tag || "lider",
      icon: "/logo/logo-mark.png",
      data: { url: daten.url || "/admin" },
    }),
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
          await f.focus();
          if ("navigate" in f) {
            try {
              await f.navigate(ziel.href);
            } catch {
              /* Fenster bleibt, wo es ist */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(ziel.href);
    })(),
  );
});

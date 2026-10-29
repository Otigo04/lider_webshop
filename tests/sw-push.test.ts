import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

// Der Service Worker wird als Text in einen vm-Kontext mit gefälschtem `self`
// geladen. So prüft der Test das ausgelieferte public/sw.js selbst, nicht eine
// Kopie davon.

type Handler = (event: Record<string, unknown>) => void;
type Optionen = { body?: unknown; tag?: unknown; data: { url: unknown } };
type Aufruf = { title: unknown; options: Optionen };

function ladeWorker() {
  const handler = new Map<string, Handler>();
  const angezeigt: Aufruf[] = [];
  const geoeffnet: string[] = [];

  const self = {
    addEventListener(name: string, fn: Handler) {
      handler.set(name, fn);
    },
    skipWaiting() {},
    location: { origin: "https://example.test" },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([]),
      openWindow: (url: string) => {
        geoeffnet.push(url);
        return Promise.resolve(null);
      },
    },
    registration: {
      showNotification(title: unknown, options: Optionen) {
        angezeigt.push({ title, options });
        return Promise.resolve();
      },
    },
  };

  const code = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  vm.runInNewContext(code, { self, console, URL });
  return { handler, angezeigt, geoeffnet };
}

async function feuerePush(data: unknown) {
  const { handler, angezeigt } = ladeWorker();
  const versprechen: Promise<unknown>[] = [];
  handler.get("push")!({
    data,
    waitUntil(p: Promise<unknown>) {
      versprechen.push(p);
    },
  });
  await Promise.all(versprechen);
  return angezeigt;
}

function mitJson(wert: unknown) {
  return { json: () => wert };
}

function pruefeFallback(angezeigt: Aufruf[]) {
  assert.equal(angezeigt.length, 1);
  const [a] = angezeigt;
  assert.equal(typeof a.title, "string");
  assert.equal(typeof a.options.body, "string");
  assert.equal(a.title, "LIDER");
  assert.equal(a.options.body, "Neue Meldung bei LIDER");
  assert.equal(a.options.tag, "lider");
  assert.equal(a.options.data.url, "/admin");
}

test("push: normaler Inhalt wird uebernommen", async () => {
  const angezeigt = await feuerePush(
    mitJson({
      title: "Neue Bestellung",
      body: "LG-1",
      tag: "order-1",
      url: "/admin/orders/1",
    }),
  );
  assert.equal(angezeigt.length, 1);
  const [a] = angezeigt;
  assert.equal(a.title, "Neue Bestellung");
  assert.equal(a.options.body, "LG-1");
  assert.equal(a.options.tag, "order-1");
  assert.equal(a.options.data.url, "/admin/orders/1");
});

test("push: ohne data (undefined) zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(undefined));
});

test("push: ohne data (null) zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(null));
});

test("push: ungueltiges JSON zeigt Fallback", async () => {
  pruefeFallback(
    await feuerePush({
      json() {
        throw new SyntaxError("Unexpected token");
      },
    }),
  );
});

test("push: JSON-Literal null zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(mitJson(null)));
});

test("push: JSON-String zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(mitJson("hallo")));
});

test("push: JSON-Zahl zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(mitJson(42)));
});

test("push: JSON-Array zeigt Fallback", async () => {
  pruefeFallback(await feuerePush(mitJson(["a", "b"])));
});

test("push: falsche Typen in title und body zeigen Fallback", async () => {
  pruefeFallback(await feuerePush(mitJson({ title: 5, body: {} })));
});

test("notificationclick: fremde Domain faellt auf /admin zurueck", async () => {
  const { handler, geoeffnet } = ladeWorker();
  const versprechen: Promise<unknown>[] = [];
  handler.get("notificationclick")!({
    notification: { close() {}, data: { url: "https://evil.example/x" } },
    waitUntil(p: Promise<unknown>) {
      versprechen.push(p);
    },
  });
  await Promise.all(versprechen);
  assert.deepEqual(geoeffnet, ["https://example.test/admin"]);
});

test("notificationclick: eigener Pfad wird geoeffnet", async () => {
  const { handler, geoeffnet } = ladeWorker();
  const versprechen: Promise<unknown>[] = [];
  handler.get("notificationclick")!({
    notification: { close() {}, data: { url: "/admin/orders/1" } },
    waitUntil(p: Promise<unknown>) {
      versprechen.push(p);
    },
  });
  await Promise.all(versprechen);
  assert.deepEqual(geoeffnet, ["https://example.test/admin/orders/1"]);
});

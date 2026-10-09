/**
 * Lädt Hook für den Testlauf: Node kennt den Alias „@/…" nicht, im Projekt
 * zeigt er auf die Wurzel. Wie in scripts/katalog-check.mjs, nur einmal
 * für alle Tests.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const wurzel = pathToFileURL(`${process.cwd()}/`).href;
register(
  `data:text/javascript,${encodeURIComponent(`
    export function resolve(spec, ctx, next) {
      if (spec.startsWith("@/")) {
        return next(${JSON.stringify(wurzel)} + spec.slice(2) + ".ts", ctx);
      }
      // „server-only" wirft außerhalb von Next – für Tests ein leeres Modul.
      if (spec === "server-only") {
        return { url: "data:text/javascript,export {}", shortCircuit: true };
      }
      return next(spec, ctx);
    }
  `)}`,
);

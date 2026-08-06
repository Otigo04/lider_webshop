import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = ["logo.svg", "logo.png"];

/** Findet die zuerst vorhandene Logo-Datei unter public/logo/, egal ob SVG oder PNG. */
export function getLogoPath(): string | null {
  for (const file of CANDIDATES) {
    if (existsSync(path.join(process.cwd(), "public", "logo", file))) {
      return `/logo/${file}`;
    }
  }
  return null;
}

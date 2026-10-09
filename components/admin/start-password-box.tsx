"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Zeigt ein Startpasswort samt fertigem Text zum Weitergeben. Der Text
 * enthält Login-Adresse, E-Mail und Passwort, damit der Admin ihn am Telefon
 * diktieren oder per Messenger einfügen kann, ohne etwas zusammenzusuchen.
 */
export function StartPasswordBox({
  title,
  password,
  email,
  dauerhaft,
}: {
  title: string;
  password: string;
  email?: string;
  /** Passwort liegt gespeichert vor und bleibt sichtbar, bis der Kunde seins vergibt */
  dauerhaft?: boolean;
}) {
  const [copied, setCopied] = useState<"passwort" | "text" | null>(null);

  async function copy(kind: "passwort" | "text") {
    const loginUrl = `${window.location.origin}/login`;
    const text =
      kind === "passwort"
        ? password
        : [
            "Ihr Zugang zum LIDER Großhandel-Shop:",
            `Anmeldung: ${loginUrl}`,
            email ? `E-Mail: ${email}` : null,
            `Startpasswort: ${password}`,
            "Beim ersten Login vergeben Sie Ihr eigenes Passwort.",
          ]
            .filter(Boolean)
            .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Zwischenablage gesperrt: das Passwort steht markierbar darüber.
    }
  }

  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-3 text-sm">
      <p className="font-medium text-warning">{title}</p>
      <p className="mt-2 select-all rounded-md border border-border bg-background px-2 py-1 font-mono text-base">
        {password}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copy("passwort")}>
          {copied === "passwort" ? "Kopiert" : "Passwort kopieren"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copy("text")}>
          {copied === "text" ? "Kopiert" : "Zugangsdaten kopieren"}
        </Button>
      </div>
      <p className="mt-2 text-muted-foreground">
        {dauerhaft
          ? "Der Kunde hat noch kein eigenes Passwort vergeben. Sobald er es tut, verschwindet das Startpasswort hier."
          : "Wird nur jetzt angezeigt – danach steht es in der Kundenakte, bis der Kunde sein eigenes Passwort vergeben hat."}
        {" "}Beim ersten Login muss der Kunde ein eigenes Passwort vergeben.
      </p>
    </div>
  );
}

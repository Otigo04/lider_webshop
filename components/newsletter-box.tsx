import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { NewsletterAbonnieren } from "@/components/forms/newsletter-abonnieren";
import { Reveal } from "@/components/reveal";
import {
  angebotBedingung,
  angebotTitel,
  type NewsletterAngebot,
} from "@/lib/newsletter-angebot";

/**
 * Newsletter-Abschnitt der Startseite. Der Anreiz kommt aus dem Gutschein
 * selbst (`angebot`, Migration 076) – gibt es keinen, steht hier nur der
 * Newsletter ohne Versprechen. Der Code geht nie an Besucher: Er steht in der
 * Mail und im Konto, und hier erst beim angemeldeten Abonnenten.
 *
 * Besucher legen ein Konto an (dort das freiwillige Häkchen); wer angemeldet
 * ist, abonniert mit einem Klick.
 */
export function NewsletterBox({
  angebot,
  stand,
}: {
  angebot: NewsletterAngebot | null;
  /** null = nicht angemeldet */
  stand: { abonniert: boolean; code: string | null } | null;
}) {
  const bedingung = angebot ? angebotBedingung(angebot) : "";

  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <div className="grid gap-8 rounded-lg border border-border bg-brand-soft p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center">
            <div>
              <p className="eyebrow flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" aria-hidden />
                Newsletter
              </p>
              <h2 className="headline mt-2 text-2xl font-bold sm:text-3xl">
                {angebot ? angebotTitel(angebot) : "Neuheiten und Angebote per E-Mail"}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {angebot
                  ? `Melden Sie sich für den LIDER-Newsletter an${
                      bedingung ? ` – der Gutschein gilt ${bedingung}` : ""
                    }. Dazu Neuheiten, reduzierte Ware und Angebote, höchstens ein paar Mal im Monat.`
                  : "Neuheiten, reduzierte Ware und Angebote, höchstens ein paar Mal im Monat. Jederzeit abbestellbar."}
              </p>
            </div>

            <div>
              {stand === null ? (
                <div className="space-y-3">
                  <Link
                    href="/register"
                    className="inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-hover sm:w-auto"
                  >
                    Konto anlegen
                  </Link>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Beim Anlegen des Kontos das Newsletter-Häkchen setzen – freiwillig und
                    jederzeit abbestellbar.{" "}
                    <Link href="/login" className="font-medium text-foreground underline">
                      Schon Kunde? Anmelden
                    </Link>
                  </p>
                </div>
              ) : stand.abonniert ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Check className="size-4 text-success" aria-hidden />
                    Sie sind für den Newsletter angemeldet.
                  </p>
                  {stand.code ? (
                    <div className="rounded-md border border-gold/50 bg-card p-4">
                      <p className="text-xs text-muted-foreground">Ihr Gutscheincode</p>
                      <p className="code mt-1 text-xl font-semibold tracking-wider">{stand.code}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Im Warenkorb eingeben. Der Code steht auch in Ihrem{" "}
                        <Link href="/account" className="underline">
                          Konto
                        </Link>
                        .
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <NewsletterAbonnieren />
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

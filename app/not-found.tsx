import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Seite nicht gefunden
      </h1>
      <p className="mt-3 text-muted-foreground">
        Die Adresse existiert nicht, oder der Artikel ist nicht mehr im
        Sortiment.
      </p>

      <div className="mt-8 flex justify-center gap-3">
        <Button asChild>
          <Link href="/shop">Zum Sortiment</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Zur Startseite</Link>
        </Button>
      </div>
    </div>
  );
}

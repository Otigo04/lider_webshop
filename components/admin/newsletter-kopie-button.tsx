"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duplicateNewsletter } from "@/lib/actions/newsletter";

export function NewsletterKopieButton({ id }: { id: string }) {
  const [laeuft, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={laeuft}
      onClick={() =>
        start(async () => {
          const e = await duplicateNewsletter(id);
          if (e.error) toast.error(e.error);
          else toast.success(e.success ?? "Kopie angelegt.");
          router.refresh();
        })
      }
    >
      Kopieren
    </Button>
  );
}

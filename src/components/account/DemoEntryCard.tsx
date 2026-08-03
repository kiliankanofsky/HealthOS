"use client";

import { PlayCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { startDemoSession } from "@/app/account/actions";
import { Button } from "@/components/ui/button";

// Einstieg in den öffentlichen Demo-Modus, direkt unter dem Login. Der
// Server legt dabei ggf. frische Mock-Daten an (siehe lib/demo/seed.ts),
// deshalb ein echter Pending-State statt eines simplen Links.
export function DemoEntryCard() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startDemoSession();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-dashed border-border/80 bg-muted/30 p-6">
      <div className="flex items-start gap-3">
        <PlayCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Ohne Konto ansehen</h2>
          <p className="text-sm text-muted-foreground">
            Erkunde HealthOS mit anonymisierten Beispieldaten — alle Module,
            Charts und der Trainings-Logger sind voll bedienbar. Echte
            Gesundheitsdaten bleiben dabei unter Verschluss.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-5 w-full"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "Demo wird vorbereitet …" : "Demo mit Beispieldaten starten"}
      </Button>
    </div>
  );
}

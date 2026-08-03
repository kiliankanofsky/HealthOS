"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";

import { endDemoSession } from "@/app/account/actions";

// Dauerhaft sichtbarer Hinweis im Demo-Modus. Bewusst über dem Header, damit
// nie der Eindruck entsteht, hier stünden echte Gesundheitsdaten.
export function DemoBanner() {
  const [pending, startTransition] = useTransition();

  return (
    // Bewusst NICHT sticky — der SiteHeader darunter ist es bereits (z-40),
    // zwei gestapelte sticky-Leisten würden sich überlagern.
    <div className="w-full border-b border-primary/20 bg-primary/10 text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-5 py-2 sm:px-8 lg:px-10">
        <p className="flex min-w-0 items-center gap-2 text-xs sm:text-sm">
          <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">
            <span className="font-semibold">Demo-Modus</span>
            <span className="text-muted-foreground">
              {" "}
              — alle Zahlen sind generierte Beispieldaten.
            </span>
          </span>
        </p>
        <button
          type="button"
          onClick={() => startTransition(() => endDemoSession())}
          disabled={pending}
          className="shrink-0 cursor-pointer rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending ? "…" : "Demo verlassen"}
        </button>
      </div>
    </div>
  );
}

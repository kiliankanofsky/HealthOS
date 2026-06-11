"use client";

import { Menu, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Variant = "light" | "dark" | "transparent";

// Einstellungs-Menü oben rechts im Header: Burger-Icon (3 Striche) öffnet
// ein Popover mit Konto-Link und Hell/Dunkel-Umschalter. Kontrolliertes
// open-State, damit das Menü beim Klick auf den Konto-Link zugeht.
export function SettingsMenu({ variant = "light" }: { variant?: Variant }) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { data: sessionData, isPending } = authClient.useSession();

  const triggerTone =
    variant === "light"
      ? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      : "text-white/70 hover:bg-white/10 hover:text-white";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Einstellungen"
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full transition-colors",
          "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
          triggerTone,
        )}
      >
        <Menu className="size-5" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-72 gap-0 p-1.5">
        <Link
          href="/account"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted"
        >
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">Konto &amp; Anmeldung</span>
            <span className="truncate text-xs text-muted-foreground">
              {isPending ? "…" : (sessionData?.user.email ?? "Anmelden")}
            </span>
          </span>
        </Link>

        <div className="my-1 h-px bg-border" aria-hidden />

        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="flex items-center gap-3 text-sm font-medium">
            {resolvedTheme === "dark" ? (
              <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <Sun className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            Darstellung
          </span>
          <SegmentedControl
            size="sm"
            options={[
              { value: "light", label: "Hell" },
              { value: "dark", label: "Dunkel" },
            ]}
            value={resolvedTheme === "dark" ? "dark" : "light"}
            onChange={(value) => setTheme(value)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

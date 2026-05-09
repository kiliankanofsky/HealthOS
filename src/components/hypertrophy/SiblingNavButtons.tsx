import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

type Props = {
  prevHref: string | null;
  prevTitle?: string;
  nextHref: string | null;
  nextTitle?: string;
  className?: string;
};

// Zwei kleine ←/→-Buttons (icon-only, ghost-Style). Disabled-Zustand,
// wenn am Ende einer Kette (kein Vorgänger/Nachfolger).
export function SiblingNavButtons({
  prevHref,
  prevTitle,
  nextHref,
  nextTitle,
  className,
}: Props) {
  return (
    <nav
      className={cn("flex items-center gap-1", className)}
      aria-label="Vorherige / Nächste"
    >
      <NavBtn
        href={prevHref}
        title={prevTitle ?? "Vorherige"}
        aria-label={prevTitle ?? "Vorherige"}
      >
        <ChevronLeft className="size-4" />
      </NavBtn>
      <NavBtn
        href={nextHref}
        title={nextTitle ?? "Nächste"}
        aria-label={nextTitle ?? "Nächste"}
      >
        <ChevronRight className="size-4" />
      </NavBtn>
    </nav>
  );
}

function NavBtn({
  href,
  children,
  ...rest
}: {
  href: string | null;
  children: React.ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const base =
    "inline-flex size-8 items-center justify-center rounded-full transition-colors";
  if (!href) {
    return (
      <span
        aria-disabled
        className={cn(base, "cursor-not-allowed text-muted-foreground/35")}
        title={rest.title}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        base,
        "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { modules, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

type Variant = "light" | "dark" | "transparent";

type Props = {
  variant?: Variant;
};

// Konsistente Top-Navigation für alle Pages außer der Home (die Home hat
// einen eigenen, full-bleed Hero). Logo links, Modul-Nav mittig (Desktop),
// Such-Pseudo + Profile rechts.
export function SiteHeader({ variant = "light" }: Props) {
  const pathname = usePathname();

  const tone =
    variant === "dark"
      ? "bg-black text-white"
      : variant === "transparent"
        ? "bg-transparent text-white"
        : "bg-background/80 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/60";

  const ringTone =
    variant === "light" ? "border-b border-border/60" : "border-b border-white/10";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full",
        tone,
        ringTone,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8 lg:h-16 lg:px-10">
        <Link href="/" className="flex items-center gap-2 group">
          <Logo />
          <span className="font-heading text-base font-semibold tracking-tight lg:text-lg">
            {siteConfig.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {modules.map((m) => {
            const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
            return (
              <Link
                key={m.slug}
                href={m.href}
                className={cn(
                  "relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? variant === "light"
                      ? "text-foreground"
                      : "text-white"
                    : variant === "light"
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-white/60 hover:text-white",
                )}
                aria-current={active ? "page" : undefined}
              >
                {m.label}
                {active && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-3 -bottom-px h-px",
                      variant === "light" ? "bg-foreground" : "bg-white",
                    )}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <MobileNav pathname={pathname} variant={variant} />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="relative inline-flex size-8 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-foreground/10 transition-transform group-hover:scale-105"
    >
      <Image
        src="/logo.png"
        alt=""
        width={32}
        height={32}
        priority
        className="size-full object-contain"
      />
    </span>
  );
}

function MobileNav({ pathname, variant }: { pathname: string; variant: Variant }) {
  return (
    <nav className="flex items-center gap-1 md:hidden">
      {modules.map((m) => {
        const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
        return (
          <Link
            key={m.slug}
            href={m.href}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? variant === "light"
                  ? "bg-foreground/10 text-foreground"
                  : "bg-white/15 text-white"
                : variant === "light"
                  ? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  : "text-white/60 hover:text-white",
            )}
            aria-current={active ? "page" : undefined}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

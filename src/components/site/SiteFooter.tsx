import Link from "next/link";

import { footerLinks, siteConfig } from "@/lib/site";

type Props = {
  variant?: "light" | "dark";
};

export function SiteFooter({ variant = "light" }: Props) {
  const isDark = variant === "dark";
  return (
    <footer
      className={
        isDark
          ? "border-t border-white/10 bg-black text-white/70"
          : "border-t border-border/60 bg-background text-muted-foreground"
      }
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 py-8 sm:px-8 sm:py-10 md:flex-row md:items-center md:justify-between lg:px-10">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={
              isDark
                ? "inline-flex size-7 items-center justify-center rounded-md bg-white text-black"
                : "inline-flex size-7 items-center justify-center rounded-md bg-foreground text-background"
            }
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M5 12h2.5l2-5 4 10 2-5H19" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={isDark ? "text-sm font-medium text-white" : "text-sm font-medium text-foreground"}>
            {siteConfig.name}
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs uppercase tracking-[0.18em]">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                isDark
                  ? "text-white/60 transition-colors hover:text-white"
                  : "text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-xs">
          Personal build · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}

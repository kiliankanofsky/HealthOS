import Link from "next/link";

import { siteConfig } from "@/lib/site";

// Schmaler Banner ganz oben — wenn `siteConfig.promo === null`, rendert nichts.
export function PromoBar() {
  if (!siteConfig.promo) return null;
  const { text, href } = siteConfig.promo;
  return (
    <Link
      href={href}
      className="group block w-full bg-black text-white transition-colors hover:bg-zinc-800"
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-center gap-2 px-5 py-2.5 text-center text-xs font-medium tracking-wide sm:px-8 lg:px-10">
        <span>{text}</span>
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  );
}

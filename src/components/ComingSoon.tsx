import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/site/AppShell";

type Props = {
  section: string;
  description: string;
};

export function ComingSoon({ section, description }: Props) {
  return (
    <AppShell>
      <main className="mx-auto flex min-h-[calc(100vh-14rem)] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span
          aria-hidden
          className="inline-flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-foreground/10 shadow-sm"
        >
          <Image
            src="/logo.png"
            alt=""
            width={160}
            height={160}
            className="size-full object-contain"
            priority
          />
        </span>
        <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
          {section}
        </p>
        <h1 className="font-heading text-5xl font-semibold tracking-tight lg:text-6xl">
          Bald verfügbar
        </h1>
        <p className="max-w-md text-base text-muted-foreground lg:text-lg">
          {description}
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
        >
          Zurück zur Übersicht
        </Link>
      </main>
    </AppShell>
  );
}

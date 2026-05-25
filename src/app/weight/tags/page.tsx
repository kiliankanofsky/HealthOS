import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/site/AppShell";
import { TagEditor } from "@/components/weight/TagEditor";
import { getAllDailyTags } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function WeightTagsPage() {
  const tags = await getAllDailyTags();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10 sm:px-8 lg:py-14">
        <header className="space-y-3">
          <Link
            href="/weight"
            className="inline-flex items-center gap-1 text-xs tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Gewicht
          </Link>
          <div className="space-y-2">
            <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
              Tags
            </p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
              Markierungen
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Cheat-Days, Alkohol-Tage und Cheat-Meals — chronologisch
              gesammelt. Bearbeite Tags hier oder im Day-Detail-Dialog auf
              der Gewichtsverlauf-Card.
            </p>
          </div>
        </header>

        <TagEditor tags={tags} />
      </main>
    </AppShell>
  );
}

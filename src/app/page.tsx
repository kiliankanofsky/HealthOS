import { HeroGrid } from "@/components/home/HeroGrid";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroGrid />
      </main>
      <SiteFooter />
    </>
  );
}

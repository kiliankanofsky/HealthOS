import { HeroGrid } from "@/components/home/HeroGrid";
import { PromoBar } from "@/components/home/PromoBar";
import { PulseSection } from "@/components/home/PulseSection";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <PromoBar />
      <SiteHeader />
      <main className="flex-1">
        <HeroGrid />
        <PulseSection />
      </main>
      <SiteFooter />
    </>
  );
}

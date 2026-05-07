import { SectionHeroes } from "@/components/home/SectionHero";
import { Topbar } from "@/components/home/Topbar";

export default function HomePage() {
  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black">
      <Topbar />
      <main className="h-full w-full">
        <SectionHeroes />
      </main>
    </div>
  );
}

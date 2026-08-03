import { isDemoRequest } from "@/lib/demo/config";

import { DemoBanner } from "./DemoBanner";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

// Wrapper für alle Pages: einheitliche Top-Nav, Inhalt, Footer — plus im
// öffentlichen Demo-Modus eine Hinweisleiste ganz oben.
export async function AppShell({ children }: { children: React.ReactNode }) {
  const demo = await isDemoRequest();

  return (
    <>
      {demo && <DemoBanner />}
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}

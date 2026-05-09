import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

// Wrapper für Modul-Pages: einheitliche Top-Nav, Inhalt, Footer.
// Die Home-Page nutzt das NICHT (sie hat einen eigenen, full-bleed Hero).
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}

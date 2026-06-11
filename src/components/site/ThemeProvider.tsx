"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Schaltet die `.dark`-Klasse auf <html> (siehe globals.css) und merkt sich
// die Wahl in localStorage. Muss als Client-Komponente ins Server-Layout
// eingehängt werden — dazu braucht <html> `suppressHydrationWarning`, weil
// next-themes die Klasse schon vor der React-Hydration setzt.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

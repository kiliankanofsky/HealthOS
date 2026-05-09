import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { siteConfig } from "@/lib/site";

import "./globals.css";

// Inter als hochwertiger Fallback für Geräte ohne SF Pro.
// `display: "swap"` rendert sofort mit System-Fallback und tauscht
// nach dem Laden — vermeidet flash of invisible text.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.metaTitle,
    template: `%s · ${siteConfig.metaTitle}`,
  },
  description: siteConfig.metaDescription,
  // Apple-Style: keine Telefonnummer-Auto-Detection.
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}

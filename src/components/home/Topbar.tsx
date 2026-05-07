"use client";

import { useEffect, useState } from "react";

// Live-Uhrzeit im Stil des Open-Headers.
export function Topbar() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const time = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      });
      setNow(time.toUpperCase());
    };
    update();
    const id = window.setInterval(update, 1000 * 30);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-6 text-[11px] tracking-[0.2em] uppercase text-white">
      <span className="pointer-events-auto flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-white/90" />
      </span>
      <span className="pointer-events-auto">{now || "—"}</span>
      <span className="pointer-events-auto opacity-80">HealthOS</span>
    </header>
  );
}

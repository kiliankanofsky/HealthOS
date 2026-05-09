"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  prevHref: string | null;
  nextHref: string | null;
  children: React.ReactNode;
};

// Trackpad-Swipe: horizontale Wheel-Events werden als Drag visualisiert
// (translate3d auf dem inneren Container). Bei Wheel-Pause wird je nach
// kumuliertem Delta entweder zur Nachbarseite navigiert oder zurückgefedert.
//
// Richtung (mit aktivem "Natural Scrolling" auf macOS):
//   Finger nach rechts auf Trackpad → Inhalt bewegt sich nach rechts →
//     wheel deltaX < 0 → kumuliertes Delta < 0 → navigiert zu PREV (links).
//   Finger nach links → deltaX > 0 → navigiert zu NEXT (rechts).
const COMMIT_THRESHOLD = 110; // px deltaX bis zur Navigation
const DRAG_CAP = 220; // px max sichtbarer Drag
const RESISTANCE_FACTOR = 0.35; // sqrt-Resistance an Kanten ohne Nachbar
const COMMIT_VIEWPORT_FRACTION = 0.55;
const COMMIT_DURATION_MS = 220;
const SPRING_DURATION_MS = 240;
const WHEEL_END_DEBOUNCE_MS = 130;

export function SiblingSwipe({ prevHref, nextHref, children }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const accumRef = useRef(0);
  const navigatingRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [translate, setTranslate] = useState(0);
  const [animate, setAnimate] = useState(false);

  // Refs auf neueste Hrefs, damit Wheel-Handler ohne Re-Bind aktuell bleibt.
  const prevHrefRef = useRef(prevHref);
  const nextHrefRef = useRef(nextHref);
  useEffect(() => {
    prevHrefRef.current = prevHref;
    nextHrefRef.current = nextHref;
  }, [prevHref, nextHref]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const finish = () => {
      if (navigatingRef.current) return;
      const accum = accumRef.current;
      accumRef.current = 0;
      const goNext = accum > 0;
      const target = goNext ? nextHrefRef.current : prevHrefRef.current;
      const past = Math.abs(accum) >= COMMIT_THRESHOLD;
      if (past && target) {
        navigatingRef.current = true;
        const out =
          (typeof window !== "undefined" ? window.innerWidth : 1024) *
          COMMIT_VIEWPORT_FRACTION;
        setAnimate(true);
        setTranslate(goNext ? -out : out);
        setTimeout(() => {
          router.push(target);
        }, COMMIT_DURATION_MS);
      } else {
        setAnimate(true);
        setTranslate(0);
      }
    };

    const onWheel = (e: WheelEvent) => {
      // Nur dominant-horizontale Gesten greifen — vertikales Scrollen bleibt frei.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (navigatingRef.current) return;

      accumRef.current += e.deltaX;
      let visual = accumRef.current;

      // Resistance, wenn am Rand der Kette gezogen wird.
      const goingNext = visual > 0;
      const goingPrev = visual < 0;
      if (goingNext && !nextHrefRef.current) {
        visual = Math.sqrt(Math.abs(visual)) * (1 / RESISTANCE_FACTOR);
      } else if (goingPrev && !prevHrefRef.current) {
        visual = -Math.sqrt(Math.abs(visual)) * (1 / RESISTANCE_FACTOR);
      }
      // Cap.
      if (visual > DRAG_CAP) visual = DRAG_CAP;
      if (visual < -DRAG_CAP) visual = -DRAG_CAP;

      setAnimate(false);
      setTranslate(-visual);

      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(finish, WHEEL_END_DEBOUNCE_MS);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, [router]);

  return (
    <div ref={containerRef} className="overflow-x-hidden">
      <div
        style={{
          transform: `translate3d(${translate}px, 0, 0)`,
          transition: animate
            ? `transform ${navigatingRef.current ? COMMIT_DURATION_MS : SPRING_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
            : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

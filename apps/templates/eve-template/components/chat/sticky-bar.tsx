"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A tab or filter row that pins under the floating top bar while its page
 * scrolls. Once pinned it gains the same mist as the top bar: solid behind the
 * controls, fading (and softly blurring) into the content passing beneath.
 * The stick offset matches the top bar's buttons; the shell already starts the
 * content below the status bar, so only the part of the top bar's padding the
 * safe area does not cover is added here.
 */
export function StickyBar({
  children,
  className,
  mistClassName,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly mistClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    // Pinned means the bar sits at its sticky offset inside its scroll area: a
    // root inset one pixel below that line clips it, so it stops being fully visible.
    let scroller = bar.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    const top = parseFloat(getComputedStyle(bar).top) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(Boolean(entry && entry.intersectionRatio < 1)),
      { root: scroller, rootMargin: `-${Math.ceil(top) + 1}px 0px 0px 0px`, threshold: [1] },
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "sticky top-[calc(max(0px,0.5rem-env(safe-area-inset-top))+2.75rem)] z-20",
        className,
      )}
      data-stuck={stuck || undefined}
      ref={ref}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-x-4 -top-[calc(max(0px,0.5rem-env(safe-area-inset-top))+2.75rem)] -bottom-6 bg-[linear-gradient(to_bottom,var(--background)_calc(100%-2.25rem),color-mix(in_oklab,var(--background)_85%,transparent)_calc(100%-1.25rem),transparent)] opacity-0 backdrop-blur-[6px] transition-opacity duration-200 [mask-image:linear-gradient(to_bottom,#000_calc(100%-1.5rem),transparent)] in-data-stuck:opacity-100 sm:-inset-x-6",
          mistClassName,
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

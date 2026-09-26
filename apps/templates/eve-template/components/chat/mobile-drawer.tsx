"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  classifyDrag,
  dragProgress,
  LOCK_DISTANCE_PX,
  releaseVelocity,
  settleDuration,
  settleTarget,
  type DrawerMode,
  type Sample,
} from "@/lib/chat/drawer-gesture";
import { useBackToClose } from "@/lib/pwa/back-layer";

const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const PHONE = "(max-width: 767px)";

type Drag = {
  mode: DrawerMode;
  startX: number;
  startY: number;
  from: number;
  width: number;
  locked: boolean;
  onScrim: boolean;
  samples: Sample[];
};

/**
 * The phone navigation drawer. It stays mounted, so it can follow a finger
 * from the first pixel: a rightward swipe anywhere on `surfaceRef` pulls it
 * open, a leftward swipe on the drawer or the dimmed page pushes it closed,
 * and a tap on the dimmed page closes it. Touch events drive it because
 * browsers cancel pointer events once a finger pans. It is a modal dialog
 * while open: the page behind is inert, focus stays inside, Escape and
 * Android's back gesture close it.
 */
export function MobileDrawer({
  children,
  description,
  onOpenChange,
  open,
  surfaceRef,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly surfaceRef: RefObject<HTMLElement | null>;
  readonly title: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const target = useRef<0 | 1>(open ? 1 : 0);
  const shown = useRef(0);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastDragEnd = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);

  const paint = useCallback((progress: number, duration = 0) => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;
    shown.current = progress;
    const transition = duration ? `${duration}ms ${EASING}` : "";
    panel.style.transition = transition && `transform ${transition}`;
    scrim.style.transition = transition && `opacity ${transition}`;
    panel.style.transform = drawerTransform(progress);
    scrim.style.opacity = String(progress);
    window.clearTimeout(hideTimer.current);
    // Closed, the drawer stays painted just off screen, so it slides in whole
    // instead of painting its contents mid-swipe; only its shadow and the
    // scrim go away.
    const setShown = (visible: boolean) => {
      panel.dataset.state = visible ? "open" : "closed";
      scrim.style.visibility = visible ? "visible" : "hidden";
    };
    if (progress > 0) setShown(true);
    else if (duration) hideTimer.current = window.setTimeout(() => setShown(false), duration);
    else setShown(false);
  }, []);

  const settle = useCallback(
    (to: 0 | 1, duration: number) => {
      target.current = to;
      paint(to, duration);
      if ((to === 1) !== openRef.current) onOpenChange(to === 1);
    },
    [onOpenChange, paint],
  );

  // Menu button, links, Escape and back arrive as `open` changes; animate from
  // wherever the drawer currently is.
  useLayoutEffect(() => {
    openRef.current = open;
    const to = open ? 1 : 0;
    if (target.current === to) return;
    target.current = to;
    const width = panelRef.current?.offsetWidth ?? 320;
    paint(to, settleDuration(Math.abs(to - shown.current) * width, 0));
  }, [open, paint]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useBackToClose(open, () => onOpenChange(false));

  // Focus moves into the drawer without popping a keyboard, and returns to the
  // menu button when the drawer closes with focus inside it.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      panel.focus({ preventScroll: true });
      return;
    }
    if (panel.contains(document.activeElement)) {
      const back = returnFocus.current;
      if (back?.isConnected) back.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [open]);

  useEffect(() => {
    const surface = surfaceRef.current;
    const panel = panelRef.current;
    if (!surface || !panel) return;
    let drag: Drag | null = null;
    let frame = 0;
    let pending = 0;

    const currentProgress = () => {
      // Mid-animation the painted position lives in the computed transform.
      const width = panel.offsetWidth || 1;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
      return Math.min(1, Math.max(0, 1 + matrix.m41 / width));
    };

    const onStart = (event: TouchEvent) => {
      drag = null;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) return;
      const mode: DrawerMode = target.current === 1 ? "close" : "open";
      if (
        mode === "open" &&
        (!window.matchMedia(PHONE).matches || startsInsideHorizontalGesture(event.target))
      ) {
        return;
      }
      drag = {
        mode,
        startX: touch.clientX,
        startY: touch.clientY,
        from: 0,
        width: 1,
        locked: false,
        onScrim: event.target === scrimRef.current,
        samples: [{ x: touch.clientX, t: event.timeStamp }],
      };
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!drag || !touch) return;
      if (!drag.locked) {
        const intent = classifyDrag(
          drag.mode,
          touch.clientX - drag.startX,
          touch.clientY - drag.startY,
        );
        if (intent === "pending") return;
        if (intent === "ignore" || hasTextSelection()) {
          drag = null;
          return;
        }
        // Anchor where the finger is now, so the drawer moves with it and never jumps.
        drag.locked = true;
        drag.width = panel.offsetWidth || 1;
        drag.from = currentProgress();
        drag.startX = touch.clientX;
        paint(drag.from);
      }
      if (event.cancelable) event.preventDefault();
      drag.samples.push({ x: touch.clientX, t: event.timeStamp });
      if (drag.samples.length > 8) drag.samples.shift();
      pending = dragProgress(drag.from, touch.clientX - drag.startX, drag.width);
      frame ||= window.requestAnimationFrame(() => {
        frame = 0;
        paint(pending);
      });
    };

    const onEnd = (event: TouchEvent) => {
      const current = drag;
      drag = null;
      if (!current) return;
      if (!current.locked) {
        // A tap on the dimmed page closes the drawer without waiting for a click.
        const touch = event.changedTouches[0];
        const still =
          touch &&
          Math.hypot(touch.clientX - current.startX, touch.clientY - current.startY) <
            LOCK_DISTANCE_PX;
        if (current.onScrim && still && event.type === "touchend") {
          lastDragEnd.current = event.timeStamp;
          onOpenChange(false);
        }
        return;
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        paint(pending);
      }
      lastDragEnd.current = event.timeStamp;
      const velocity = event.type === "touchcancel" ? 0 : releaseVelocity(current.samples);
      const to = settleTarget(shown.current, velocity);
      settle(to, settleDuration(Math.abs(to - shown.current) * current.width, velocity));
    };

    surface.addEventListener("touchstart", onStart, { passive: true });
    surface.addEventListener("touchmove", onMove, { passive: false });
    surface.addEventListener("touchend", onEnd);
    surface.addEventListener("touchcancel", onEnd);
    return () => {
      window.cancelAnimationFrame(frame);
      surface.removeEventListener("touchstart", onStart);
      surface.removeEventListener("touchmove", onMove);
      surface.removeEventListener("touchend", onEnd);
      surface.removeEventListener("touchcancel", onEnd);
    };
  }, [onOpenChange, paint, settle, surfaceRef]);

  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-50 touch-none bg-black/40 md:hidden"
        data-mobile-drawer-scrim
        onClick={(event) => {
          // Touches are handled above; this is the mouse, minus the click a touch leaves behind.
          if (event.timeStamp - lastDragEnd.current > 350) onOpenChange(false);
        }}
        ref={scrimRef}
        style={{ opacity: 0, visibility: "hidden" }}
      />
      <div
        aria-describedby={descriptionId}
        aria-hidden={!open || undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[21rem] touch-pan-y flex-col shadow-2xl outline-none will-change-transform data-[state=closed]:shadow-none md:hidden"
        data-mobile-drawer
        data-state="closed"
        inert={!open}
        onKeyDown={(event) => {
          // React bubbles keys from portals (a chat's menu, the Rename dialog)
          // through here; those layers handle their own Escape and Tab.
          if (
            event.nativeEvent.defaultPrevented ||
            !event.currentTarget.contains(event.target as Node)
          ) {
            return;
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            onOpenChange(false);
          } else if (event.key === "Tab") {
            trapTab(event.currentTarget, event);
          }
        }}
        ref={panelRef}
        role="dialog"
        style={{ transform: drawerTransform(0) }}
        tabIndex={-1}
      >
        <h2 className="sr-only" id={titleId}>
          {title}
        </h2>
        <p className="sr-only" id={descriptionId}>
          {description}
        </p>
        {children}
      </div>
    </>
  );
}

/**
 * Closed, the drawer sits one pixel further left than its width: at widths
 * like 86vw of 360px its right border would otherwise round onto the screen
 * as a hairline.
 */
function drawerTransform(progress: number) {
  return `translate3d(calc(${(progress - 1) * 100}% - ${1 - progress}px), 0, 0)`;
}

function trapTab(panel: HTMLElement, event: { shiftKey: boolean; preventDefault: () => void }) {
  const focusable = [
    ...panel.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function hasTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

// Carousels, code blocks, tables, sliders and text fields keep their own
// horizontal gestures.
function startsInsideHorizontalGesture(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (
      node.matches(
        "input, textarea, [contenteditable=''], [contenteditable='true'], [role='slider']",
      )
    ) {
      return true;
    }
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth) {
      return true;
    }
  }
  return false;
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TouchEventHandler } from "react";

type Gesture = {
  x: number;
  y: number;
};

const OPEN_DISTANCE_PX = 64;
const CLOSE_DISTANCE_PX = 72;
const DIRECTION_RATIO = 1.25;

// Touch events, not pointer events: browsers fire `pointercancel` as soon as a
// finger starts panning, so a pointer-based swipe never completes on a phone.
// The open swipe starts anywhere, because Android's system back gesture owns
// the screen edge and never delivers edge swipes to the page.
export function useMobileSidebarSwipe({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const surfaceStart = useRef<Gesture | null>(null);
  const drawerStart = useRef<Gesture | null>(null);

  const onSurfaceTouchStart = useCallback<TouchEventHandler<HTMLDivElement>>(
    (event) => {
      surfaceStart.current = null;
      const touch = event.touches[0];
      if (
        open ||
        event.touches.length !== 1 ||
        !touch ||
        !window.matchMedia("(max-width: 767px)").matches ||
        startsInsideHorizontalGesture(event.target)
      ) {
        return;
      }

      surfaceStart.current = { x: touch.clientX, y: touch.clientY };
    },
    [open],
  );

  const onDrawerTouchStart = useCallback<TouchEventHandler<HTMLDivElement>>(
    (event) => {
      drawerStart.current = null;
      const touch = event.touches[0];
      if (!open || event.touches.length !== 1 || !touch) return;

      drawerStart.current = { x: touch.clientX, y: touch.clientY };
    },
    [open],
  );

  useEffect(() => {
    const finishGesture = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      const surface = surfaceStart.current;
      const drawer = drawerStart.current;
      surfaceStart.current = null;
      drawerStart.current = null;
      if (!touch || hasTextSelection()) return;

      if (surface && !open && isHorizontalSwipe(surface, touch, OPEN_DISTANCE_PX)) {
        onOpenChange(true);
      }

      if (drawer && open && isHorizontalSwipe(drawer, touch, -CLOSE_DISTANCE_PX)) {
        onOpenChange(false);
      }
    };

    const cancelGesture = () => {
      surfaceStart.current = null;
      drawerStart.current = null;
    };

    window.addEventListener("touchend", finishGesture, true);
    window.addEventListener("touchcancel", cancelGesture, true);

    return () => {
      window.removeEventListener("touchend", finishGesture, true);
      window.removeEventListener("touchcancel", cancelGesture, true);
    };
  }, [onOpenChange, open]);

  return {
    surfaceHandlers: {
      onTouchStart: onSurfaceTouchStart,
    },
    drawerHandlers: {
      onTouchStart: onDrawerTouchStart,
    },
  };
}

function isHorizontalSwipe(start: Gesture, end: Touch, distance: number) {
  const dx = end.clientX - start.x;
  const dy = Math.abs(end.clientY - start.y);
  const travelled = distance > 0 ? dx >= distance : dx <= distance;

  return travelled && Math.abs(dx) >= dy * DIRECTION_RATIO;
}

function hasTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed);
}

// Carousels, code blocks, tables, sliders and text fields keep their own
// horizontal gestures; menu triggers already open on touch-down.
function startsInsideHorizontalGesture(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (
      node.matches(
        "input, textarea, [contenteditable=''], [contenteditable='true'], [role='slider'], [aria-haspopup]",
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

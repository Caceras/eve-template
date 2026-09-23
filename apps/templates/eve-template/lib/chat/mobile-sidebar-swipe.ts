"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEventHandler } from "react";

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
};

const OPEN_EDGE_PX = 24;
const OPEN_DISTANCE_PX = 64;
const CLOSE_DISTANCE_PX = 72;
const DIRECTION_RATIO = 1.25;

export function useMobileSidebarSwipe({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const surfaceStart = useRef<Gesture | null>(null);
  const drawerStart = useRef<Gesture | null>(null);

  const onSurfacePointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (
        open ||
        !event.isPrimary ||
        event.clientX > OPEN_EDGE_PX ||
        !window.matchMedia("(max-width: 767px)").matches
      ) {
        return;
      }
      surfaceStart.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [open],
  );

  const onSurfacePointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      const start = surfaceStart.current;
      surfaceStart.current = null;
      if (!start || start.pointerId !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = Math.abs(event.clientY - start.y);
      if (dx >= OPEN_DISTANCE_PX && dx >= dy * DIRECTION_RATIO) {
        onOpenChange(true);
      }
    },
    [onOpenChange],
  );

  const onDrawerPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (!open || !event.isPrimary) return;
      drawerStart.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [open],
  );

  useEffect(() => {
    if (!open) {
      drawerStart.current = null;
      return;
    }

    const finishDrawerGesture = (event: PointerEvent) => {
      const start = drawerStart.current;
      drawerStart.current = null;
      if (!start || start.pointerId !== event.pointerId) return;

      const dx = event.clientX - start.x;
      const dy = Math.abs(event.clientY - start.y);
      if (dx <= -CLOSE_DISTANCE_PX && Math.abs(dx) >= dy * DIRECTION_RATIO) {
        onOpenChange(false);
      }
    };
    const cancelDrawerGesture = () => {
      drawerStart.current = null;
    };

    window.addEventListener("pointerup", finishDrawerGesture, true);
    window.addEventListener("pointercancel", cancelDrawerGesture, true);
    return () => {
      window.removeEventListener("pointerup", finishDrawerGesture, true);
      window.removeEventListener("pointercancel", cancelDrawerGesture, true);
    };
  }, [onOpenChange, open]);

  const clearSurface = useCallback(() => {
    surfaceStart.current = null;
  }, []);

  return {
    surfaceHandlers: {
      onPointerCancel: clearSurface,
      onPointerDown: onSurfacePointerDown,
      onPointerUp: onSurfacePointerUp,
    },
    drawerHandlers: {
      onPointerDown: onDrawerPointerDown,
    },
  };
}

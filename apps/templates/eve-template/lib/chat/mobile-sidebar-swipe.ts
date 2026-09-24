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
    },
    [open],
  );

  const onDrawerPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (!open || !event.isPrimary) return;

      drawerStart.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
    },
    [open],
  );

  useEffect(() => {
    const finishGesture = (event: PointerEvent) => {
      const surface = surfaceStart.current;
      surfaceStart.current = null;

      if (surface && surface.pointerId === event.pointerId) {
        const dx = event.clientX - surface.x;
        const dy = Math.abs(event.clientY - surface.y);

        if (!open && dx >= OPEN_DISTANCE_PX && dx >= dy * DIRECTION_RATIO) {
          onOpenChange(true);
        }
      }

      const drawer = drawerStart.current;
      drawerStart.current = null;

      if (drawer && drawer.pointerId === event.pointerId) {
        const dx = event.clientX - drawer.x;
        const dy = Math.abs(event.clientY - drawer.y);

        if (open && dx <= -CLOSE_DISTANCE_PX && Math.abs(dx) >= dy * DIRECTION_RATIO) {
          onOpenChange(false);
        }
      }
    };

    const cancelGesture = () => {
      surfaceStart.current = null;
      drawerStart.current = null;
    };

    window.addEventListener("pointerup", finishGesture, true);
    window.addEventListener("pointercancel", cancelGesture, true);

    return () => {
      window.removeEventListener("pointerup", finishGesture, true);
      window.removeEventListener("pointercancel", cancelGesture, true);
    };
  }, [onOpenChange, open]);

  return {
    surfaceHandlers: {
      onPointerDown: onSurfacePointerDown,
    },
    drawerHandlers: {
      onPointerDown: onDrawerPointerDown,
    },
  };
}

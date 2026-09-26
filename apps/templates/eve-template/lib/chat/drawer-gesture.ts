// Pure gesture math for the phone navigation drawer, kept free of React and the
// DOM so the thresholds are unit-tested (scripts/test-drawer-gesture.mjs).

/** Finger travel before the gesture commits to a direction. */
export const LOCK_DISTANCE_PX = 8;
/** Horizontal travel must beat vertical travel by this factor to be a swipe. */
export const DIRECTION_RATIO = 1.2;
/**
 * Release speed (px/ms) above which the drawer settles the way the thumb was
 * last moving, like Android's DrawerLayout; slower releases go to the nearer
 * side. The margin absorbs the jitter of a lifting finger.
 */
export const FLING_SPEED = 0.15;
/** How far back velocity samples reach. */
export const VELOCITY_WINDOW_MS = 100;

export type DrawerMode = "open" | "close";
export type Sample = { readonly x: number; readonly t: number };

/**
 * Decides what a finger that has moved (dx, dy) is doing: still undecided,
 * a vertical scroll (the drawer stays out of it), or a horizontal drag the
 * drawer follows. Opening follows rightward drags, closing leftward ones.
 */
export function classifyDrag(mode: DrawerMode, dx: number, dy: number) {
  if (Math.abs(dx) < LOCK_DISTANCE_PX && Math.abs(dy) < LOCK_DISTANCE_PX) return "pending";
  const horizontal = Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO;
  const toward = mode === "open" ? dx > 0 : dx < 0;
  return horizontal && toward ? "drag" : "ignore";
}

/** Drawer position (0 closed, 1 open) for a finger that moved dx from where the drag began. */
export function dragProgress(from: number, dx: number, width: number) {
  return clamp(from + dx / Math.max(width, 1), 0, 1);
}

/** Release velocity in px/ms over the most recent samples. */
export function releaseVelocity(samples: readonly Sample[]) {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS) ?? last;
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
}

/** Where a released drawer settles: the thumb's direction wins, otherwise the nearer side. */
export function settleTarget(progress: number, velocity: number): 0 | 1 {
  if (velocity >= FLING_SPEED) return 1;
  if (velocity <= -FLING_SPEED) return 0;
  return progress >= 0.5 ? 1 : 0;
}

/**
 * Settle animation length: the remaining distance at (at least) the finger's
 * speed, so a fast fling finishes quickly and a slow release glides.
 */
export function settleDuration(remainingPx: number, velocity: number) {
  const speed = Math.max(Math.abs(velocity), 1.1);
  return Math.round(clamp((remainingPx / speed) * 2.2, 140, 300));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

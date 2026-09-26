"use client";

import { useEffect, useRef } from "react";

// Android's back gesture closes the open drawer or search instead of leaving
// the page, as in a native app. Opening a layer pushes a same-URL history
// entry; back pops it and closes the layer; closing from the UI pops it too.
// A layer closed by navigating hands its entry to that navigation, which
// replaces it (see navigateFromLayer), so the history never gains a dead step.

const KEY = "aegenticaLayer";
let pendingBack: Promise<void> | null = null;
let leavingByNavigation = false;

type LayerState = { readonly [KEY]?: string } | null;
const topLayer = () => (window.history.state as LayerState)?.[KEY];

export function useBackToClose(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    let pushed = false;
    let popped = false;
    const onPop = () => {
      if (topLayer() === id) return;
      popped = true;
      close.current();
    };
    let cancelled = false;
    // A layer that just closed may still be popping its own entry.
    void Promise.resolve(pendingBack).then(() => {
      if (cancelled) return;
      window.history.pushState({ ...window.history.state, [KEY]: id }, "");
      window.addEventListener("popstate", onPop);
      pushed = true;
    });
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPop);
      const leaving = leavingByNavigation;
      leavingByNavigation = false;
      if (pushed && !popped && !leaving && topLayer() === id) goBack();
    };
  }, [open]);
}

/**
 * Navigates from inside an open layer: the layer's history entry becomes the
 * destination, so back afterwards returns to the page under the layer.
 */
export function navigateFromLayer(
  router: { push: (href: string) => void; replace: (href: string) => void },
  href: string,
) {
  if (topLayer()) {
    leavingByNavigation = true;
    router.replace(href);
  } else {
    router.push(href);
  }
}

/** For `<Link replace>` inside a layer: call from the link's onClick. */
export function markLayerNavigation() {
  if (topLayer()) leavingByNavigation = true;
}

function goBack() {
  pendingBack = new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("popstate", done);
      pendingBack = null;
      resolve();
    };
    window.addEventListener("popstate", done);
    window.history.back();
  });
}

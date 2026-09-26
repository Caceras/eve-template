// Long-press and right-click behave like an app's, not a web page's, where
// the browser's own menu has nothing useful to offer.

const standalone = () => matchMedia("(display-mode: standalone)").matches;
const touch = () => matchMedia("(pointer: coarse)").matches;

/**
 * A row with its own menu opens it on long-press under a finger, and on
 * right-click in the installed app, instead of the browser's link menu.
 */
export function opensAppMenu() {
  return touch() || standalone();
}

/** A short haptic tick, as a native long-press gives. Silent where unsupported. */
export function tick() {
  // Chrome blocks (and logs) vibration before the first tap on the page.
  if (!navigator.userActivation?.hasBeenActive) return;
  try {
    navigator.vibrate?.(10);
  } catch {}
}

/**
 * In the installed app on a phone, a long-press on an in-app link would open
 * Chrome's menu (open in new tab, preview page), which leaves the app. Links
 * to other sites and images keep the browser's menu, for copy and save.
 */
export function suppressBrowserLinkMenu() {
  const onContextMenu = (event: Event) => {
    if (event.defaultPrevented || !touch() || !standalone()) return;
    const link = (event.target as Element | null)?.closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin) return;
    if ((event.target as Element).closest("img, video")) return;
    event.preventDefault();
  };
  document.addEventListener("contextmenu", onContextMenu);
  return () => document.removeEventListener("contextmenu", onContextMenu);
}

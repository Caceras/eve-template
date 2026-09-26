// Android's back gesture closes the open dialog, menu or picker before it
// leaves the page, as in a native app. Chrome delivers back to CloseWatchers
// before it walks history, so every open Radix layer (the shadcn Dialog,
// AlertDialog, DropdownMenu and Select) gets one, and back closes the
// top layer the way Escape would. No history entries are involved, so none go
// stale. The drawer, search and model picker keep their history entries
// (back-layer.ts); for search and the model picker both paths close the same
// layer, and whichever fires first wins. Browsers without CloseWatcher keep
// their default back.

type Watcher = { onclose: (() => void) | null; destroy: () => void };
type WatcherConstructor = new () => Watcher;

const LAYERS = [
  "dialog-content",
  "alert-dialog-content",
  "dropdown-menu-content",
  "dropdown-menu-sub-content",
  "select-content",
]
  .map((slot) => `[data-slot="${slot}"][data-state="open"]`)
  .join(",");

export function watchCloseRequests() {
  const CloseWatcher = (window as unknown as { CloseWatcher?: WatcherConstructor }).CloseWatcher;
  if (!CloseWatcher) return () => {};
  const watched = new Map<Element, Watcher>();

  const sync = () => {
    const open = new Set(document.querySelectorAll(LAYERS));
    for (const [layer, watcher] of watched) {
      if (open.has(layer)) continue;
      watched.delete(layer);
      watcher.destroy();
    }
    // Later portals sit on top, so document order is stacking order.
    for (const layer of open) {
      if (watched.has(layer)) continue;
      const watcher = new CloseWatcher();
      watcher.onclose = () => {
        watched.delete(layer);
        // Radix closes its top layer on an Escape that reaches the document.
        // Dispatched on the document itself, it reaches no component handler.
        // Cancelable, so the layer marks it handled and nothing else acts on it.
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
        // A layer that refused to close keeps listening for the next back.
        queueMicrotask(sync);
      };
      watched.set(layer, watcher);
    }
  };

  // Portals mount directly in <body>; opening and closing flips data-state.
  // Neither observer sees streamed chat text.
  const portals = new MutationObserver(sync);
  const states = new MutationObserver(sync);
  portals.observe(document.body, { childList: true });
  states.observe(document.body, { subtree: true, attributeFilter: ["data-state"] });
  sync();
  return () => {
    portals.disconnect();
    states.disconnect();
    for (const watcher of watched.values()) watcher.destroy();
    watched.clear();
  };
}

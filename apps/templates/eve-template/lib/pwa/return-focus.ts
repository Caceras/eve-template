import { useLayoutEffect, type RefObject } from "react";
import { focusOpensKeyboard } from "./keyboard";

// Radix returns focus to a dialog's Trigger when it closes, and to nothing
// (the page body) when the dialog was opened another way: a shortcut, a menu
// item or state. Dialogs remember what had focus when they opened and return
// there instead.

/** What should get focus back when a dialog opened from `active` closes. */
export function focusReturnTarget(active: Element | null): HTMLElement | null {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  // A menu item closes with its menu; its menu's button stays.
  const menu = active.closest("[role=menu][aria-labelledby]");
  const trigger = menu ? document.getElementById(menu.getAttribute("aria-labelledby") ?? "") : null;
  return trigger ?? active;
}

/**
 * Rendered first inside a dialog's content, so it mounts with the dialog and
 * records the focus before a field's autoFocus or Radix moves it.
 */
export function RememberFocus({ into }: { readonly into: RefObject<HTMLElement | null> }) {
  useLayoutEffect(() => {
    into.current = focusReturnTarget(document.activeElement);
  }, [into]);
  return null;
}

/** An `onCloseAutoFocus` step: focus `target` unless the caller already handled it. */
export function returnFocus(target: HTMLElement | null, event: Event) {
  if (event.defaultPrevented || !target?.isConnected) return;
  event.preventDefault();
  // A text field would raise the phone keyboard on its own.
  if (focusOpensKeyboard() && target.matches("input, textarea, [contenteditable]")) return;
  target.focus({ preventScroll: true });
}

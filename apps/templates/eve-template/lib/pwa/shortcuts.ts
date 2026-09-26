"use client";
import { useSyncExternalStore } from "react";

export type ShortcutModifier = "⌘" | "Ctrl" | "Ctrl/⌘";
/**
 * Desktop shortcuts use ⌘ on Apple devices and Ctrl elsewhere, as native apps
 * do: on a Mac, Ctrl+B and Ctrl+K are text-editing keys in every text field.
 */
export function isApplePlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || "");
}
/** The platform's shortcut modifier on its own (Alt stays free for typing characters). */
export function isShortcutModifier(event: KeyboardEvent) {
  const pressed = isApplePlatform()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return pressed && !event.altKey && !event.isComposing;
}
const subscribeNever = () => () => {};
/** The modifier's name for hints; the server cannot know the platform and renders "Ctrl/⌘". */
export function useShortcutModifier() {
  return useSyncExternalStore<ShortcutModifier>(
    subscribeNever,
    () => (isApplePlatform() ? "⌘" : "Ctrl"),
    () => "Ctrl/⌘",
  );
}
/** `aria-keyshortcuts` for the modifier plus keys, e.g. ariaShortcut(modifier, "Shift+O"). */
export function ariaShortcut(modifier: ShortcutModifier, keys: string) {
  if (modifier === "⌘") return `Meta+${keys}`;
  if (modifier === "Ctrl") return `Control+${keys}`;
  return `Control+${keys} Meta+${keys}`;
}

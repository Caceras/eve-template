"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { COMMAND_EVENT } from "@/lib/navigation";
import { isShortcutModifier } from "@/lib/pwa/shortcuts";

// Search (cmdk and its dialog, command-menu.tsx) is fetched when the browser is
// idle or on first use, not with every page. Ctrl/⌘+K and the Search buttons
// are handled here, so they work from the first moment.
const loadPalette = () => import("./command-menu");
const CommandMenu = dynamic(() => loadPalette().then((module) => module.CommandMenu), {
  ssr: false,
});

export function CommandMenuLauncher() {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  useEffect(() => {
    const toggle = () => {
      setUsed(true);
      setOpen((value) => !value);
    };
    const key = (event: KeyboardEvent) => {
      if (isShortcutModifier(event) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener(COMMAND_EVENT, toggle);
    // Ready before the first press. A failed prefetch is retried on opening.
    const prefetch = () => void loadPalette().catch(() => {});
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(prefetch, { timeout: 10_000 })
        : undefined;
    const timer = idle === undefined ? setTimeout(prefetch, 3_000) : undefined;
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener(COMMAND_EVENT, toggle);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, []);
  // Mounted from the first opening on, so later ones animate like any dialog.
  return used ? <CommandMenu open={open} setOpen={setOpen} /> : null;
}

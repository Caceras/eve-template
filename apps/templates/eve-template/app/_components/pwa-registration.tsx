"use client";
import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/pwa/install-prompt";

export function PwaRegistration() {
  useEffect(() => {
    captureInstallPrompt();
    // Task notifications badge the app icon; opening the app counts as seeing them.
    const clearBadge = () => {
      if (document.visibilityState === "visible") navigator.clearAppBadge?.().catch(() => {});
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    // The dev server rebuilds assets constantly; a cached shell would only get in the way.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    return () => document.removeEventListener("visibilitychange", clearBadge);
  }, []);
  return null;
}

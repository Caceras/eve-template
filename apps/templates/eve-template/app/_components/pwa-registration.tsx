"use client";
import { useEffect } from "react";
import { captureInstallPrompt } from "@/lib/pwa/install-prompt";

export function PwaRegistration() {
  useEffect(() => {
    captureInstallPrompt();
    // The dev server rebuilds assets constantly; a cached shell would only get in the way.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

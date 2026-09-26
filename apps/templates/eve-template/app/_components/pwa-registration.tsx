"use client";
import { useEffect } from "react";
import { watchCloseRequests } from "@/lib/pwa/close-layers";
import { receiveLaunchedFiles } from "@/lib/pwa/file-launch";
import { captureInstallPrompt } from "@/lib/pwa/install-prompt";
import { suppressBrowserLinkMenu } from "@/lib/pwa/touch";
import { watchForNewVersion } from "@/lib/pwa/version-recovery";
import { RELEASE } from "@/lib/release";

export function PwaRegistration() {
  useEffect(() => {
    captureInstallPrompt();
    receiveLaunchedFiles();
    const stopWatching = watchCloseRequests();
    const stopSuppressing = suppressBrowserLinkMenu();
    // After a deploy, reload once into the new build instead of failing sends.
    const stopWatchingVersion = watchForNewVersion(RELEASE);
    // Task notifications badge the app icon; opening the app counts as seeing them.
    const clearBadge = () => {
      if (document.visibilityState === "visible") navigator.clearAppBadge?.().catch(() => {});
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    // Unsent drafts and attachments live in IndexedDB; an installed app keeps
    // them through storage pressure instead of losing them to eviction.
    if (matchMedia("(display-mode: standalone)").matches)
      navigator.storage?.persist?.().catch(() => false);
    // The dev server rebuilds assets constantly; a cached shell would only get in the way.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    return () => {
      stopWatching();
      stopSuppressing();
      stopWatchingVersion();
      document.removeEventListener("visibilitychange", clearBadge);
    };
  }, []);
  return null;
}

"use client";

export type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

/** Chrome fires `beforeinstallprompt` once, early; keep it until Settings asks. */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
    listeners.forEach((listener) => listener());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((listener) => listener());
  });
}

export const installPrompt = () => deferred;

export function onInstallPromptChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice;
  deferred = null;
  listeners.forEach((listener) => listener());
}

"use client";

export function base64UrlToBytes(value: string) {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** True when the browser's subscription was made with another key than the server's. */
export function hasOtherKey(subscription: PushSubscription, publicKey: string) {
  const key = subscription.options?.applicationServerKey;
  if (!key) return false; // The browser does not say; keep it.
  const current = new Uint8Array(key);
  const expected = base64UrlToBytes(publicKey);
  return (
    current.length !== expected.length || current.some((byte, index) => byte !== expected[index])
  );
}

/**
 * This browser's push subscription for the server's current VAPID key. One
 * made with an older key (the server lost or replaced its key pair) can never
 * deliver again, so it is dropped and replaced; `replaced` is its endpoint,
 * for the server to forget. With `create`, a missing subscription is made too.
 */
export async function currentSubscription(
  pushManager: PushManager,
  publicKey: string,
  create = false,
) {
  let subscription = await pushManager.getSubscription();
  let replaced: string | null = null;
  if (subscription && hasOtherKey(subscription, publicKey)) {
    replaced = subscription.endpoint;
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription && (create || replaced)) {
    try {
      subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
      });
    } catch (error) {
      // Some browsers subscribe only after a tap; Turn on offers one.
      if (create) throw error;
    }
  }
  return { subscription, replaced };
}

/**
 * Best effort, before signing out: the server forgets this device while the
 * session can still ask it to, and the browser drops its subscription.
 */
export async function forgetThisDevice() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/settings/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsubscribe", endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Signing out never waits on notifications.
  }
}

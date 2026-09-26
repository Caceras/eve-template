import webpush, { type PushSubscription } from "web-push";
import { readEncrypted, withSettingsLock, writeEncrypted } from "./secure-settings";

/**
 * Web Push for the installed app: VAPID keys are generated on first use and
 * kept, with device subscriptions, in the encrypted settings directory.
 */
const FILE = "push.enc";
const MAX_DEVICES = 20;

type Device = PushSubscription & { createdAt: string; label: string };
type PushState = { publicKey: string; privateKey: string; devices: Device[] };

async function load(): Promise<PushState> {
  const stored = (await readEncrypted(FILE, 200_000)) as PushState | undefined;
  if (stored?.publicKey && stored.privateKey) return { ...stored, devices: stored.devices ?? [] };
  return withSettingsLock(FILE, async () => {
    const again = (await readEncrypted(FILE, 200_000)) as PushState | undefined;
    if (again?.publicKey) return again;
    const keys = webpush.generateVAPIDKeys();
    const created = { publicKey: keys.publicKey, privateKey: keys.privateKey, devices: [] };
    await writeEncrypted(FILE, created);
    return created;
  });
}

async function update(change: (state: PushState) => void) {
  await load();
  await withSettingsLock(FILE, async () => {
    const state = (await readEncrypted(FILE, 200_000)) as PushState;
    change(state);
    await writeEncrypted(FILE, state);
  });
}

export async function pushPublicKey() {
  return (await load()).publicKey;
}

export async function deviceCount() {
  return (await load()).devices.length;
}

export function isValidSubscription(value: unknown): value is PushSubscription {
  const subscription = value as PushSubscription | undefined;
  return (
    typeof subscription?.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    subscription.endpoint.length < 2048 &&
    typeof subscription.keys?.p256dh === "string" &&
    typeof subscription.keys?.auth === "string"
  );
}

export async function addDevice(subscription: PushSubscription, label: string) {
  await update((state) => {
    state.devices = [
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        createdAt: new Date().toISOString(),
        label: label.slice(0, 80),
      },
      ...state.devices.filter((device) => device.endpoint !== subscription.endpoint),
    ].slice(0, MAX_DEVICES);
  });
}

export async function removeDevice(endpoint: string) {
  await update((state) => {
    state.devices = state.devices.filter((device) => device.endpoint !== endpoint);
  });
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/**
 * Sends to every registered device; drops devices the push service reports as
 * gone (404, 410) or refuses for this server's key (401, 403: subscribed with a
 * key pair the server no longer has). Settings on that device renews them.
 */
export async function sendPush(message: PushMessage) {
  const state = await load();
  if (state.devices.length === 0) return { sent: 0 };
  const subject = process.env.BETTER_AUTH_URL?.trim() || "mailto:operator@aegentica.invalid";
  const payload = JSON.stringify({
    title: message.title.slice(0, 120),
    body: message.body.slice(0, 300),
    url: message.url.startsWith("/") && !/^\/[/\\]/.test(message.url) ? message.url : "/",
    tag: message.tag,
  });
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    state.devices.map(async (device) => {
      try {
        await webpush.sendNotification(device, payload, {
          TTL: 24 * 60 * 60,
          urgency: "normal",
          timeout: 10_000,
          vapidDetails: { subject, publicKey: state.publicKey, privateKey: state.privateKey },
        });
        sent += 1;
      } catch (error) {
        const { statusCode: status, body } = error as { statusCode?: number; body?: unknown };
        if (status === 401 || status === 403 || status === 404 || status === 410) {
          gone.push(device.endpoint);
          return;
        }
        // The endpoint URL is the device's credential, so only its host is logged.
        const service = device.endpoint.split("/")[2];
        console.error(
          `[push] Delivery through ${service} failed${status ? ` (HTTP ${status})` : ""}:`,
          error instanceof Error ? error.message : String(error),
          typeof body === "string" ? body.slice(0, 300) : "",
        );
      }
    }),
  );
  if (gone.length > 0)
    await update((current) => {
      current.devices = current.devices.filter((device) => !gone.includes(device.endpoint));
    });
  return { sent };
}

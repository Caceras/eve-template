"use client";
import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { installPrompt, onInstallPromptChange, promptInstall } from "@/lib/pwa/install-prompt";
import { currentSubscription } from "@/lib/pwa/push-subscription";
import { SettingsShell } from "./settings-shell";

type Support = "loading" | "unsupported" | "ios-browser" | "ready";

function deviceLabel() {
  const agent = navigator.userAgent;
  const device = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iPhone or iPad"
      : /Mac/.test(agent)
        ? "Mac"
        : /Windows/.test(agent)
          ? "Windows"
          : "Device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "browser";
  return `${device} · ${browser}`;
}

async function notificationsApi(body?: Record<string, unknown>) {
  const response = await fetch("/api/settings/notifications", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data as { publicKey?: string; devices?: number; message?: string };
}

export function NotificationSettings() {
  return (
    <SettingsShell
      section="notifications"
      title="Notifications"
      description="Install Ægentica on this device and decide when it may notify you."
    >
      <DeviceSettings />
    </SettingsShell>
  );
}

/** Install the app and turn on notifications for scheduled task results. */
export function DeviceSettings() {
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [support, setSupport] = useState<Support>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState<"install" | "on" | "off" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true,
    );
    setCanInstall(Boolean(installPrompt()));
    const stopWatching = onInstallPromptChange(() => setCanInstall(Boolean(installPrompt())));
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);

    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      setSupport(ios && !standalone ? "ios-browser" : "unsupported");
    else {
      setSupport("ready");
      void Promise.all([navigator.serviceWorker.ready, notificationsApi()])
        .then(async ([registration, status]) => {
          // A subscription made with a key the server no longer has is renewed.
          const { subscription, replaced } = status.publicKey
            ? await currentSubscription(registration.pushManager, status.publicKey)
            : { subscription: await registration.pushManager.getSubscription(), replaced: null };
          if (replaced)
            await notificationsApi({ action: "unsubscribe", endpoint: replaced }).catch(() => {});
          setSubscribed(Boolean(subscription));
          // Re-register so a server that lost its device list keeps notifying this one.
          const data = subscription
            ? await notificationsApi({
                action: "subscribe",
                subscription: subscription.toJSON(),
                label: deviceLabel(),
              })
            : status;
          setDevices(data.devices ?? 0);
        })
        .catch(() => undefined);
    }
    return () => {
      stopWatching();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function run(kind: NonNullable<typeof busy>, work: () => Promise<string | void>) {
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      const result = await work();
      if (result) setMessage(result);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const install = () => run("install", promptInstall);

  const turnOn = () =>
    run("on", async () => {
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("Notifications are blocked. Allow them in your browser's site settings.");
      const { publicKey } = await notificationsApi();
      if (!publicKey) throw new Error("The server did not return a notification key.");
      const registration = await navigator.serviceWorker.ready;
      const { subscription, replaced } = await currentSubscription(
        registration.pushManager,
        publicKey,
        true,
      );
      if (!subscription) throw new Error("This browser did not turn notifications on.");
      if (replaced)
        await notificationsApi({ action: "unsubscribe", endpoint: replaced }).catch(() => {});
      const data = await notificationsApi({
        action: "subscribe",
        subscription: subscription.toJSON(),
        label: deviceLabel(),
      });
      setSubscribed(true);
      setDevices(data.devices ?? 0);
      return "Notifications are on for this device.";
    });

  const turnOff = () =>
    run("off", async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const data = await notificationsApi({
          action: "unsubscribe",
          endpoint: subscription.endpoint,
        });
        await subscription.unsubscribe();
        setDevices(data.devices ?? 0);
      }
      setSubscribed(false);
      return "Notifications are off for this device.";
    });

  const test = () => run("test", async () => (await notificationsApi({ action: "test" })).message);

  return (
    <section aria-labelledby="device-title" className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="device-title" className="font-medium">
        This device
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Install Ægentica as an app and get a notification when a scheduled task is done.
      </p>

      <div className="mt-4 divide-y rounded-md border">
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">App</p>
            <p className="text-xs text-muted-foreground">
              {installed
                ? "Installed. Ægentica opens in its own window."
                : canInstall
                  ? "Add Ægentica to your home screen or dock."
                  : support === "ios-browser"
                    ? "In Safari, tap Share, then Add to Home Screen."
                    : "Use your browser's menu: Install app or Add to Home screen."}
            </p>
          </div>
          {!installed && canInstall && (
            <Button
              className="h-11 pointer-fine:md:h-8"
              disabled={Boolean(busy)}
              onClick={() => void install()}
            >
              {busy === "install" && <Loader2Icon className="size-4 animate-spin" />}
              Install
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {support === "loading"
                ? "Checking…"
                : support === "ios-browser"
                  ? "On iPhone and iPad, install the app first, then turn notifications on from it."
                  : support === "unsupported"
                    ? "This browser does not support notifications."
                    : subscribed
                      ? `On · ${devices} device${devices === 1 ? "" : "s"} connected`
                      : "Off on this device"}
            </p>
          </div>
          {support === "ready" && subscribed && (
            <Button
              variant="ghost"
              className="h-11 pointer-fine:md:h-8"
              disabled={Boolean(busy)}
              onClick={() => void test()}
            >
              {busy === "test" && <Loader2Icon className="size-4 animate-spin" />}
              Send test
            </Button>
          )}
          {support === "ready" && (
            <Button
              variant={subscribed ? "outline" : "default"}
              className="h-11 pointer-fine:md:h-8"
              disabled={Boolean(busy)}
              onClick={() => void (subscribed ? turnOff() : turnOn())}
            >
              {(busy === "on" || busy === "off") && <Loader2Icon className="size-4 animate-spin" />}
              {subscribed ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

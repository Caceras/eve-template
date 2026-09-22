import {
  addDevice,
  deviceCount,
  isValidSubscription,
  pushPublicKey,
  removeDevice,
  sendPush,
} from "./push-notifications";
import { handleOperatorSettings, json } from "./settings-api";

const status = async () => ({ publicKey: await pushPublicKey(), devices: await deviceCount() });

export function handleNotificationSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(await status()),
    async write(body) {
      switch (body.action) {
        case "subscribe": {
          if (!isValidSubscription(body.subscription))
            return json({ error: "This browser returned an invalid push subscription." }, 400);
          const label = typeof body.label === "string" ? body.label : "Device";
          await addDevice(body.subscription, label);
          return json(await status());
        }
        case "unsubscribe":
          if (typeof body.endpoint !== "string") return json({ error: "Invalid request." }, 400);
          await removeDevice(body.endpoint);
          return json(await status());
        case "test": {
          const { sent } = await sendPush({
            title: "Ægentica",
            body: "Notifications are on. Scheduled task results will appear here.",
            url: "/tasks",
            tag: "test",
          });
          return sent > 0
            ? json({ ok: true, message: `Sent to ${sent} device${sent === 1 ? "" : "s"}.` })
            : json(
                { error: "No device accepted the notification. Turn notifications on again." },
                422,
              );
        }
        default:
          return json({ error: "Invalid action." }, 400);
      }
    },
  });
}

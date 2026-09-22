import { connection } from "next/server";
import { handleNotificationSettings } from "@/lib/notification-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleNotificationSettings(request);
}
export const POST = handleNotificationSettings;

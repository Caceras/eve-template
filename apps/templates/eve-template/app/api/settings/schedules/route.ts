import { connection } from "next/server";
import { handleScheduleSettings } from "@/lib/schedule-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleScheduleSettings(request);
}
export const POST = handleScheduleSettings;

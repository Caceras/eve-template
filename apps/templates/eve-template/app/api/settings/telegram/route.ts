import { connection } from "next/server";
import { handleTelegramSettings } from "@/lib/telegram-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleTelegramSettings(request);
}
export const POST = handleTelegramSettings;

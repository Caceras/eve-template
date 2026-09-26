import { connection } from "next/server";
import { handleVoiceSettings } from "@/lib/voice-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleVoiceSettings(request);
}
export const POST = handleVoiceSettings;

import { connection } from "next/server";
import { getServerViewer } from "@/lib/session";
import { handleSpeech } from "@/lib/voice-speech-handler";
const speech = (request: Request) => handleSpeech(request, () => getServerViewer());
export async function GET(request: Request) {
  await connection();
  return speech(request);
}
export const POST = speech;

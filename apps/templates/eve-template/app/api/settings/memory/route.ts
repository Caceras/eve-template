import { connection } from "next/server";
import { handleMemorySettings } from "@/lib/memory-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleMemorySettings(request);
}
export const POST = handleMemorySettings;

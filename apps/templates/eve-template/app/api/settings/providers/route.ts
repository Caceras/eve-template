import { connection } from "next/server";
import { handleProviderSettings } from "@/lib/provider-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleProviderSettings(request);
}
export const POST = handleProviderSettings;

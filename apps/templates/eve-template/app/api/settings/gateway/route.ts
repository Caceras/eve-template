import { connection } from "next/server";
import { handleGatewaySettings } from "@/lib/gateway-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleGatewaySettings(request);
}
export const POST = handleGatewaySettings;

import { connection } from "next/server";
import { getGatewayCatalog } from "@/lib/gateway-model-catalog";
export async function GET() {
  await connection();
  return Response.json(await getGatewayCatalog(), { headers: { "Cache-Control": "no-store" } });
}

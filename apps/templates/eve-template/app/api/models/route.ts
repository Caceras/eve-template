import { connection } from "next/server";
import { isProviderId } from "@/lib/model-catalog";
import { getCatalog } from "@/lib/provider-catalog";
import { readActiveProvider } from "@/lib/provider-settings";
export async function GET(request: Request) {
  await connection();
  const requested = new URL(request.url).searchParams.get("provider");
  const provider = isProviderId(requested) ? requested : await readActiveProvider();
  return Response.json(await getCatalog(provider), { headers: { "Cache-Control": "no-store" } });
}

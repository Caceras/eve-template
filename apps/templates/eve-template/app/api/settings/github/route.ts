import { connection } from "next/server";
import { handleGithubSettings } from "@/lib/github-settings-handler";
export async function GET(request: Request) {
  await connection();
  return handleGithubSettings(request);
}
export const POST = handleGithubSettings;

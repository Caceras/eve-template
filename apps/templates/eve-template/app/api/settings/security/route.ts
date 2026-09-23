import { handleSecurity } from "@/lib/security-handler";
export const runtime = "nodejs";
export const GET = handleSecurity;
export const POST = handleSecurity;

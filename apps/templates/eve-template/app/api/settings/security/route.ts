import { handleSecurity } from "@/lib/security-handler";

export const GET = handleSecurity;
export const POST = handleSecurity;

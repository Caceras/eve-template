import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { betterAuthEveAuth, internalEveAuth, passwordEveAuth } from "@/lib/eve-auth";

export default eveChannel({
  auth: [
    internalEveAuth,
    betterAuthEveAuth,
    passwordEveAuth,
    // Only on Vercel: elsewhere any bearer token that decodes as a Vercel OIDC
    // JWT would make eve fetch Vercel's discovery documents for nothing.
    ...(process.env.VERCEL ? [vercelOidc()] : []),
    localDev(),
  ],
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/*"],
    maxBytes: 10 * 1024 * 1024,
  },
});

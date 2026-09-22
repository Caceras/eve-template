import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { betterAuthEveAuth, internalEveAuth, passwordEveAuth } from "@/lib/eve-auth";

export default eveChannel({
  auth: [internalEveAuth, betterAuthEveAuth, passwordEveAuth, vercelOidc(), localDev()],
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/*"],
    maxBytes: 10 * 1024 * 1024,
  },
});

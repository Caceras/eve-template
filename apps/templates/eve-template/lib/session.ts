import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { SetupStatus, Viewer } from "@/lib/chat/types";
import { getPasswordSessionFromHeaders, operatorUsername } from "@/lib/password-auth";
import { getSetupStatus } from "@/lib/setup";

function passwordViewer(): Viewer {
  return {
    email: "local@aegentica.local",
    id: "eve-chat-user",
    image: null,
    name: operatorUsername(),
  };
}

export async function getServerViewer(setupStatus?: SetupStatus): Promise<Viewer | null> {
  const requestHeaders = await headers();
  const status = setupStatus ?? (await getSetupStatus());

  if (!status.appReady) {
    return null;
  }

  if (status.authMode === "local-dev") {
    return passwordViewer();
  }

  if (status.authMode === "password") {
    return getPasswordSessionFromHeaders(requestHeaders) ? passwordViewer() : null;
  }

  if (status.authMode !== "vercel") {
    return null;
  }

  try {
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });

    if (!session?.user) {
      return null;
    }

    return {
      email: session.user.email,
      id: session.user.id,
      image: session.user.image ?? null,
      name: session.user.name,
    };
  } catch {
    return null;
  }
}

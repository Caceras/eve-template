"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useChatShell } from "./chat-shell-context";

export function SecurityNotice() {
  const { viewer } = useChatShell();
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    if (!viewer) return;
    const controller = new AbortController();
    void fetch("/api/settings/security", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setNeeded((await response.json()).requiresChange === true);
      }).catch(() => {});
    return () => controller.abort();
  }, [viewer]);
  if (!viewer || !needed) return null;
  return <p role="alert" className="rounded-lg border p-4 text-sm leading-6">Replace the temporary or short password before adding API keys. <Link className="font-medium underline underline-offset-4" href="/settings/security">Open security settings</Link></p>;
}

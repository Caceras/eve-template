"use client";

import { AlertCircleIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isVersionSkewError, requestReload } from "@/lib/pwa/version-recovery";

export function ErrorToast({
  message,
  onDismiss,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  // After a deploy this page's Server Actions are gone ("Server Action … was
  // not found on the server"): say what happened and reload into the new
  // version. A message that failed to send is back in the box as a draft.
  const updated = isVersionSkewError(message);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (updated) setReloading(requestReload("error"));
  }, [updated]);
  return (
    <div
      aria-live="assertive"
      className="fixed top-[calc(max(0.5rem,env(safe-area-inset-top))+3rem)] right-3 z-50 flex w-[calc(100vw-1.5rem)] max-w-sm items-start gap-3 rounded-lg border border-destructive/30 bg-background/95 p-3 text-sm shadow-lg backdrop-blur sm:right-4"
      role="alert"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        {/* No generic title: the same toast carries limits and validation, not only failures. */}
        {updated ? (
          <>
            <p className="font-medium">Ægentica was updated</p>
            <p className="mt-0.5 text-muted-foreground">
              {reloading ? "Loading the new version…" : "Reload to continue with the new version."}
            </p>
          </>
        ) : (
          <p className="break-words">{message}</p>
        )}
        {updated ? (
          <Button
            className="mt-2 h-10 pointer-fine:md:h-8"
            onClick={() => window.location.reload()}
            size="sm"
            type="button"
            variant="outline"
          >
            Reload
          </Button>
        ) : /in Settings\b/.test(message) ? (
          <Button asChild className="mt-2 h-10 pointer-fine:md:h-8" size="sm" variant="outline">
            <Link href="/settings" onClick={onDismiss}>
              Open Settings
            </Link>
          </Button>
        ) : null}
      </div>
      <Button
        aria-label="Dismiss error"
        className="-mt-1 -mr-1 size-10 text-muted-foreground hover:text-foreground pointer-fine:md:size-7"
        onClick={onDismiss}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

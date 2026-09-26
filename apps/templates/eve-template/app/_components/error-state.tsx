"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isVersionSkewError, requestReload } from "@/lib/pwa/version-recovery";
import { cn } from "@/lib/utils";

/**
 * The product's own error state (app/error.tsx, app/(chat)/error.tsx), laid out
 * like NotFoundState. After a deploy the old page cannot load the new build's
 * files, so that case says so and reloads once by itself.
 */
export function ErrorState({
  error,
  standalone = false,
}: {
  readonly error: Error & { readonly digest?: string };
  // Outside the chat shell the page owns the viewport; inside it, the shell does.
  readonly standalone?: boolean;
}) {
  const updated = isVersionSkewError(error);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (updated) setReloading(requestReload("error"));
  }, [updated]);
  const Root = standalone ? "main" : "div";
  return (
    <Root
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-4 text-center",
        standalone ? "fixed inset-0 overflow-y-auto" : "h-full",
      )}
    >
      <img
        alt="Ægentica"
        className="mb-5 size-11 select-none invert dark:invert-0"
        draggable={false}
        src="/aegentica.svg"
      />
      <h1 className="text-2xl font-medium tracking-tight">
        {updated ? "Ægentica was updated" : "Something went wrong"}
      </h1>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground" role="status">
        {updated
          ? reloading
            ? "Loading the new version…"
            : "Reload to continue with the new version."
          : "This page could not be shown. Your conversations are safe on your server."}
      </p>
      <Button className="mt-6 min-h-11" onClick={() => window.location.reload()} type="button">
        Reload
      </Button>
      {error.digest ? (
        <p className="mt-4 text-xs text-muted-foreground">Reference {error.digest}</p>
      ) : null}
    </Root>
  );
}

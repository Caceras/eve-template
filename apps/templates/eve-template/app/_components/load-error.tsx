"use client";
import { RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A page whose data failed to load says so in plain words, with Retry,
 * instead of showing an empty state that claims there is nothing.
 */
export function LoadError({
  className,
  message,
  onRetry,
}: {
  readonly className?: string;
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col items-start gap-3 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      role="alert"
    >
      <p className="text-sm">{message}</p>
      <Button className="h-11 shrink-0 pointer-fine:md:h-9" onClick={onRetry} variant="outline">
        <RotateCwIcon className="size-4" />
        Retry
      </Button>
    </div>
  );
}

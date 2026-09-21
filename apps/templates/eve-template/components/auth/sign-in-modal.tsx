"use client";

import { LockKeyholeIcon } from "lucide-react";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import { SignInButton } from "@/components/auth/sign-in-button";
import { VercelIcon } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuthMode } from "@/lib/chat/types";

export function SignInModal({
  authMode,
  callbackPath,
  disabled,
  onBeforeSignIn,
  onOpenChange,
  open,
}: {
  readonly authMode: AuthMode;
  readonly callbackPath?: string;
  readonly disabled?: boolean;
  readonly onBeforeSignIn?: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const usesPassword = authMode === "password";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-5 rounded-2xl border-black/[0.06] p-5 shadow-2xl sm:max-w-[360px] sm:p-6 dark:border-white/[0.08]">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-1 flex size-10 items-center justify-center rounded-full border border-border/70 bg-muted/60">
            {usesPassword ? (
              <LockKeyholeIcon className="size-4 text-foreground" />
            ) : (
              <VercelIcon className="size-4 text-foreground" />
            )}
          </div>
          <DialogTitle>
            {usesPassword ? "Sign in" : "Continue with Vercel"}
          </DialogTitle>
          <DialogDescription>
            {usesPassword
              ? "Enter the password for this agent."
              : "Use your Vercel account to continue."}
          </DialogDescription>
        </DialogHeader>
        {usesPassword ? (
          <PasswordSignInForm callbackPath={callbackPath} onBeforeSignIn={onBeforeSignIn} />
        ) : (
          <SignInButton
            callbackPath={callbackPath}
            className="h-11 w-full"
            disabled={disabled}
            onBeforeSignIn={onBeforeSignIn}
            variant="outline"
          >
            Continue with Vercel
          </SignInButton>
        )}
      </DialogContent>
    </Dialog>
  );
}

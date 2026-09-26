"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useChatShell } from "./chat-shell-context";

/**
 * A signed-out page's own Sign in button. While it shows, it is the page's
 * one obvious sign-in action, so the top bar hides its button (the sidebar
 * keeps its quiet account row), as the top bar hides Search beside the
 * sidebar's.
 */
export function PageSignInButton() {
  const { claimPageSignIn, requestSignIn } = useChatShell();
  useEffect(claimPageSignIn, [claimPageSignIn]);
  return <Button onClick={() => requestSignIn()}>Sign in</Button>;
}

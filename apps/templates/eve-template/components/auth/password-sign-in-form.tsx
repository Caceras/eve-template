"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { focusOpensKeyboard } from "@/lib/pwa/keyboard";

export function PasswordSignInForm({
  callbackPath,
  onBeforeSignIn,
}: {
  readonly callbackPath?: string;
  readonly onBeforeSignIn?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failures, setFailures] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // A refused sign-in hands focus back to the password (the disabled button
  // dropped it), except where focusing would raise the phone keyboard.
  useEffect(() => {
    const field = passwordRef.current;
    if (!failures || !field || focusOpensKeyboard()) return;
    field.focus();
    field.select();
  }, [failures]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password || pending) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/password-auth/login", {
        body: JSON.stringify({ username, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as {
        readonly error?: string;
      } | null;

      if (!response.ok) {
        setError(result?.error ?? "Unable to sign in.");
        setPending(false);
        setFailures((count) => count + 1);
        return;
      }

      onBeforeSignIn?.();
      window.location.assign(resolveCallbackPath(callbackPath));
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
      setPending(false);
      setFailures((count) => count + 1);
    }
  }

  return (
    <form className="space-y-3.5" onSubmit={handleSubmit}>
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Username</span>
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="username"
          autoFocus={!focusOpensKeyboard()}
          required
          disabled={pending}
          className="h-11"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label className="block space-y-1.5 text-sm font-medium">
        <span>Password</span>
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          aria-label="Password"
          autoComplete="current-password"
          required
          disabled={pending}
          id="eve-chat-password"
          onChange={(event) => setPassword(event.target.value)}
          className="h-11"
          placeholder="Password"
          ref={passwordRef}
          type="password"
          value={password}
        />
      </label>
      {error ? (
        <p aria-live="polite" className="text-sm text-destructive" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <Button
        aria-busy={pending}
        className="h-11 w-full rounded-lg"
        disabled={pending}
        type="submit"
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

function resolveCallbackPath(path: string | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  return path;
}
